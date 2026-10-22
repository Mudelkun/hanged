/*
 * The HTTP API (Fastify). Every body is checked against a JSON schema before
 * a handler runs, with the limits from contract.ts.
 *   POST /v1/players      a new anonymous player → { id, secret }
 *   POST /v1/sync         the device's snapshot + new round reports (auth)
 *   GET  /v1/leaderboard  ?period=week|all[&me=<player id>]
 *   GET  /health          for Railway
 */
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';

import { LIMITS, type Period, type SyncRequest } from './contract.ts';
import type { Db } from './db.ts';
import { createLeaderboard } from './leaderboard.ts';
import { credentials, register, sync } from './players.ts';

const int = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const report = {
  type: 'object',
  additionalProperties: false,
  required: ['seq', 'wordId', 'level', 'won', 'wrong', 'description', 'letters', 'at'],
  properties: {
    seq: int(1, 2 ** 31 - 1),
    wordId: { type: 'string', pattern: '^[a-z]{2}-[a-z]{1,15}$' },
    level: int(1, 99),
    won: { type: 'boolean' },
    wrong: int(0, 26),
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
        name: { type: ['string', 'null'], maxLength: LIMITS.nameLength },
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

export async function buildApp(db: Db, opts: FastifyServerOptions & { boardTtlMs?: number } = {}) {
  const { boardTtlMs, ...fastifyOpts } = opts;
  // Railway sits behind a proxy: rate limits must see the caller's address, not the proxy's.
  const app = Fastify({ trustProxy: true, bodyLimit: 256 * 1024, ...fastifyOpts });
  // The app doesn't need CORS; the web preview (npx expo start --web) does.
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const leaderboard = createLeaderboard(db, boardTtlMs);

  app.get('/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  app.post('/v1/players', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (_req, reply) =>
    reply.code(201).send(await register(db)),
  );

  app.post<{ Body: SyncRequest }>('/v1/sync', { schema: { body: syncBody } }, async (req, reply) => {
    const who = credentials(req.headers.authorization);
    const done = who && (await sync(db, who, req.body));
    return done ?? reply.code(401).send({ error: 'unknown player' });
  });

  app.get<{ Querystring: { period: Period; me?: string } }>(
    '/v1/leaderboard',
    { schema: { querystring: boardQuery } },
    async (req) => leaderboard(req.query.period, req.query.me),
  );

  return app;
}
