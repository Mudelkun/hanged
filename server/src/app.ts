/*
 * The HTTP API (Fastify). Every body is checked against a JSON schema before
 * a handler runs, with the limits from contract.ts.
 *   POST /v1/players      a new anonymous player → { id, secret }
 *   POST /v1/sync         the device's snapshot + new round reports (auth)
 *   DELETE /v1/players/me deletes the player (auth)
 *   GET  /v1/leaderboard  ?period=week|all[&me=<player id>]
 *   GET  /v1/names/available ?name=<name>[&me=<player id>] → { available }
 *   GET  /health          for Railway
 * Versus (online multiplayer): its socket and friends routes (versus/routes.ts),
 * friend invite links (versus/links.ts: /i/<code> and the .well-known files),
 * and the admin page with its on/off switch (admin.ts).
 */
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';

import { adminRoutes } from './admin.ts';

import { LIMITS, type NameAvailableResponse, type Period, type SyncRequest } from './contract.ts';
import type { Db } from './db.ts';
import { createLeaderboard } from './leaderboard.ts';
import { NAME_SENT_MAX } from './names.ts';
import { credentials, deletePlayer, nameAvailable, register, signedIn, sync } from './players.ts';
import { VERSUS_LIMITS } from './versus-contract.ts';
import { Hub, type HubOptions } from './versus/hub.ts';
import { linkRoutes, type LinkOptions } from './versus/links.ts';
import { versusRoutes } from './versus/routes.ts';
import { readSwitch } from './versus/store.ts';
import { loadWords, type WordSource } from './versus/words.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** Versus's live state (versus/hub.ts). */
    hub: Hub;
  }
}

export interface AppOptions extends FastifyServerOptions {
  boardTtlMs?: number;
  newPlayersPerHour?: number;
  /** Versus words; read from the `words` table when left out. */
  words?: WordSource;
  /** ADMIN_TOKEN: the admin page exists only with one. */
  adminToken?: string;
  /** VERSUS_DISABLED: Versus stays off whatever the switch says. */
  versusForcedOff?: boolean;
  /** For tests: Versus's clock and dice. */
  versus?: Pick<HubOptions, 'clock' | 'rng'>;
  /** Invite links: the stores and the app ids the phone checks before opening the app. */
  links?: LinkOptions;
  /** TRUST_PROXY_HOPS: proxies in front of the server (Railway: 1, its edge). */
  proxyHops?: number;
}

const int = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const report = {
  type: 'object',
  additionalProperties: false,
  required: ['seq', 'wordId', 'level', 'won', 'wrong', 'description', 'letters', 'at'],
  properties: {
    seq: int(1, 2 ** 31 - 1),
    wordId: { type: 'string', pattern: '^(?:en-[a-z]{1,15}|fr-[a-zàâçéèêëîïôùûüÿœ]{1,15}|es-[a-záéíóúüñ]{1,15}|de-[a-zäöüß]{1,15})$' },
    level: int(1, 99),
    won: { type: 'boolean' },
    wrong: int(0, 26),
    tokens: int(0, 1_000),
    description: { type: 'boolean' },
    letters: { type: 'boolean' },
    at: int(0, 2 ** 53 - 1),
  },
};

const syncBody = {
  type: 'object',
  additionalProperties: false,
  required: ['player', 'reports'],
  properties: {
    player: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'characterId', 'language', 'wordsGuessed', 'level', 'tokens'],
      properties: {
        name: { type: ['string', 'null'], maxLength: NAME_SENT_MAX },
        characterId: { type: 'string', pattern: '^[a-z]{1,20}$' },
        language: { type: 'string', pattern: '^[a-z]{2}$' },
        wordsGuessed: int(0, 10_000_000),
        level: int(1, 99),
        tokens: int(0, 1_000_000_000),
      },
    },
    reports: { type: 'array', maxItems: LIMITS.reportsPerSync, items: report },
  },
};

const boardQuery = {
  type: 'object',
  additionalProperties: false,
  required: ['period'],
  properties: {
    period: { type: 'string', enum: ['week', 'all'] },
    me: { type: 'string', pattern: UUID },
  },
};

const nameQuery = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: NAME_SENT_MAX },
    me: { type: 'string', pattern: UUID },
  },
};

export async function buildApp(db: Db, opts: AppOptions = {}) {
  const { boardTtlMs, newPlayersPerHour = 20, words, adminToken, versusForcedOff = false, versus, links = {}, proxyHops = 1, ...fastifyOpts } = opts;
  // Railway sits behind a proxy: rate limits must see the caller's address, not the proxy's. Trust
  // exactly `proxyHops` hops, so req.ip is the address our own proxy wrote: `true` would take the
  // leftmost X-Forwarded-For, which the caller writes, and let anyone dodge every per-IP limit with
  // a made-up header. (A plain number trusts nothing in Fastify 5: everyone would share one limit.)
  const app = Fastify({ trustProxy: (_addr, hop) => hop < proxyHops, bodyLimit: 256 * 1024, ...fastifyOpts });
  // A 5xx says nothing of what failed (SQL, stack): that goes to the log only.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    return reply.code(status).send({ error: status >= 500 ? 'server' : err.message });
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
  });
  // The app doesn't need CORS; the web preview (npx expo start --web) does. DELETE isn't allowed by default.
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  // Messages are tiny JSON: compression would cost more CPU and memory per socket than it saves
  await app.register(websocket, { options: { maxPayload: VERSUS_LIMITS.messageBytes, perMessageDeflate: false } });
  const leaderboard = createLeaderboard(db, boardTtlMs);
  const status = versusForcedOff ? { enabled: false, message: null } : await readSwitch(db);
  const hub = new Hub({ db, words: words ?? (await loadWords(db)), status, log: app.log, ...versus });
  app.decorate('hub', hub);

  app.get('/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  app.post('/v1/players', { config: { rateLimit: { max: newPlayersPerHour, timeWindow: '1 hour' } } }, async (_req, reply) =>
    reply.code(201).send(await register(db)),
  );

  app.post<{ Body: SyncRequest }>('/v1/sync', { schema: { body: syncBody } }, async (req, reply) => {
    const who = credentials(req.headers.authorization);
    const done = who && (await sync(db, who, req.body));
    return done ?? reply.code(401).send({ error: 'unknown player' });
  });

  app.delete('/v1/players/me', async (req, reply) => {
    const who = credentials(req.headers.authorization);
    const done = who && (await deletePlayer(db, who));
    if (!done) return reply.code(401).send({ error: 'unknown player' });
    hub.forget(who.id);
    return reply.code(204).send();
  });

  app.get<{ Querystring: { period: Period; me?: string } }>(
    '/v1/leaderboard',
    { schema: { querystring: boardQuery } },
    async (req) => leaderboard(req.query.period, req.query.me),
  );

  // Names are public on the boards, so saying one is taken gives nothing away. A reserved name
  // ("Admin") is checked for the signed-in player only (Authorization, optional), never a bare `me`.
  app.get<{ Querystring: { name: string; me?: string } }>(
    '/v1/names/available',
    { schema: { querystring: nameQuery } },
    async (req): Promise<NameAvailableResponse> => ({
      available: await nameAvailable(db, req.query.name, req.query.me, (await signedIn(db, req.headers.authorization)) ?? undefined),
    }),
  );
  app.addHook('preClose', async () => hub.close());
  versusRoutes(app, db, hub);
  linkRoutes(app, db, links);
  adminRoutes(app, db, hub, { token: adminToken, forcedOff: versusForcedOff });

  return app;
}
