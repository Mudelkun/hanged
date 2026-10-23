/*
 * Versus over HTTP: the live socket, the switch's status, and the friends
 * system (REST: it changes rarely and wants a plain answer). Every friends
 * route signs the player in (Authorization: Bearer <id>:<secret>) and is
 * closed while Versus is off. A change pushes `friends` to whoever it
 * concerns, so open lists refresh without polling.
 *   GET    /v1/live                              the socket (hub.ts)
 *   GET    /v1/versus/status                     { enabled, message }
 *   GET    /v1/friends                           friends (with presence), requests in and out, blocked
 *   GET    /v1/players/search?q=                 players whose name starts with q
 *   POST   /v1/friends/requests      {playerId}  ask; mutual asks become friends
 *   POST   /v1/friends/requests/:id/accept
 *   DELETE /v1/friends/requests/:id              decline theirs, or cancel mine
 *   DELETE /v1/friends/:id
 *   PUT    /v1/blocks/:id   DELETE /v1/blocks/:id
 *   POST   /v1/players/:id/report    {reason}
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from '../db.ts';
import { credentials } from '../players.ts';
import type { ReportReason, RequestResponse } from '../versus-contract.ts';
import type { Hub } from './hub.ts';
import { acceptRequest, authorized, block, deleteRequest, friendsOf, removeFriend, report, search, sendRequest, unblock } from './store.ts';

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: UUID } } };
type IdParams = { Params: { id: string } };

export function versusRoutes(app: FastifyInstance, db: Db, hub: Hub) {
  app.get('/v1/live', { websocket: true }, (socket) => hub.attach(socket));

  app.get('/v1/versus/status', async () => hub.status);

  /** The signed-in player's id; null after answering 401 (or 503 while Versus is off). */
  async function me(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
    if (!hub.status.enabled) {
      reply.code(503).send({ error: 'disabled' });
      return null;
    }
    const who = credentials(req.headers.authorization);
    if (who && (await authorized(db, who))) return who.id;
    reply.code(401).send({ error: 'unknown player' });
    return null;
  }

  app.get('/v1/friends', async (req, reply) => {
    const id = await me(req, reply);
    return id && friendsOf(db, id, (x) => hub.presence(x));
  });

  app.get<{ Querystring: { q: string } }>(
    '/v1/players/search',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { querystring: { type: 'object', required: ['q'], properties: { q: { type: 'string', minLength: 1, maxLength: 40 } } } },
    },
    async (req, reply) => {
      const id = await me(req, reply);
      return id && search(db, id, req.query.q);
    },
  );

  app.post<{ Body: { playerId: string } }>(
    '/v1/friends/requests',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: { type: 'object', additionalProperties: false, required: ['playerId'], properties: { playerId: { type: 'string', pattern: UUID } } } },
    },
    async (req, reply) => {
      const id = await me(req, reply);
      if (!id) return;
      const to = req.body.playerId;
      if (to === id) return reply.code(400).send({ error: 'self' });
      const outcome = await sendRequest(db, id, to);
      if (outcome === 'notFound') return reply.code(404).send({ error: 'unknown player' });
      if (outcome === 'limit') return reply.code(409).send({ error: 'limit' });
      if (outcome === 'friends') hub.friendsChanged(id, to, true);
      else hub.requestsChanged(id, to);
      return { status: outcome } satisfies RequestResponse;
    },
  );

  app.post<IdParams>('/v1/friends/requests/:id/accept', { schema: { params: idParams } }, async (req, reply) => {
    const id = await me(req, reply);
    if (!id) return;
    if (!(await acceptRequest(db, id, req.params.id))) return reply.code(404).send({ error: 'no request' });
    hub.friendsChanged(id, req.params.id, true);
    return reply.code(204).send();
  });

  app.delete<IdParams>('/v1/friends/requests/:id', { schema: { params: idParams } }, async (req, reply) => {
    const id = await me(req, reply);
    if (!id) return;
    if (await deleteRequest(db, id, req.params.id)) hub.requestsChanged(id, req.params.id);
    return reply.code(204).send();
  });

  app.delete<IdParams>('/v1/friends/:id', { schema: { params: idParams } }, async (req, reply) => {
    const id = await me(req, reply);
    if (!id) return;
    if (await removeFriend(db, id, req.params.id)) hub.friendsChanged(id, req.params.id, false);
    return reply.code(204).send();
  });

  app.put<IdParams>('/v1/blocks/:id', { schema: { params: idParams } }, async (req, reply) => {
    const id = await me(req, reply);
    if (!id) return;
    if (req.params.id === id) return reply.code(400).send({ error: 'self' });
    await block(db, id, req.params.id);
    hub.blockChanged(id, req.params.id, true);
    hub.requestsChanged(id, req.params.id);
    return reply.code(204).send();
  });

  app.delete<IdParams>('/v1/blocks/:id', { schema: { params: idParams } }, async (req, reply) => {
    const id = await me(req, reply);
    if (!id) return;
    if (await unblock(db, id, req.params.id)) hub.blockChanged(id, req.params.id, false);
    hub.requestsChanged(id);
    return reply.code(204).send();
  });

  app.post<IdParams & { Body: { reason: ReportReason } }>(
    '/v1/players/:id/report',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        params: idParams,
        body: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: { type: 'string', enum: ['name', 'cheating', 'other'] } } },
      },
    },
    async (req, reply) => {
      const id = await me(req, reply);
      if (!id) return;
      if (req.params.id === id) return reply.code(400).send({ error: 'self' });
      return (await report(db, id, req.params.id, req.body.reason)) ? reply.code(204).send() : reply.code(404).send({ error: 'unknown player' });
    },
  );
}
