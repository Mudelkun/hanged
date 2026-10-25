/* The server's defences: what a forged header, a crash, a deleted account or a dropped socket must not do. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { after, before, describe, it } from 'node:test';

import WebSocket from 'ws';

import { buildApp } from '../src/app.ts';
import type { RegisterResponse } from '../src/contract.ts';
import { embedded, type Db, type Sql } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { type ServerMessage, VERSUS_PROTOCOL } from '../src/versus-contract.ts';
import { Hub } from '../src/versus/hub.ts';
import { FakeClock, fakeWords } from './versus-helpers.ts';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
let base: string;

before(async () => {
  db = await embedded();
  await migrate(db);
  app = await buildApp(db, { newPlayersPerHour: 3, words: fakeWords(), links: { publicUrl: 'https://hanged.example/' } });
  app.get('/test/boom', async () => {
    throw new Error('relation "players" secret_hash leaked');
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
after(async () => {
  await app.close();
  await db.close();
});

/** A request as Railway's edge passes it on: whatever the caller sent, then the address the edge saw. */
const register = (callerSays: string, edgeSaw: string) =>
  app.inject({ method: 'POST', url: '/v1/players', headers: { 'x-forwarded-for': `${callerSays}, ${edgeSaw}` } });

describe('security', () => {
  it("rate limits by the address the proxy saw, not one the caller made up", async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await register(`10.0.0.${i}`, '203.0.113.7')).statusCode);
    assert.deepEqual(codes, [201, 201, 201, 429]);
    // another real caller has their own limit
    assert.equal((await register('10.0.0.9', '198.51.100.4')).statusCode, 201);
  });

  it('answers a crash without its details, and marks every answer nosniff', async () => {
    const res = await app.inject({ url: '/test/boom' });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.json(), { error: 'server' });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    // a client error still says what was wrong
    const bad = await app.inject({ url: '/v1/leaderboard?period=year' });
    assert.equal(bad.statusCode, 400);
    assert.match(bad.json<{ error: string }>().error, /period/);
  });

  it("builds the invite link from PUBLIC_URL, never from the caller's Host", async () => {
    const p = (await register('1.1.1.1', '192.0.2.1')).json<RegisterResponse>();
    const auth = { authorization: `Bearer ${p.id}:${p.secret}` };
    const { code } = (await app.inject({ method: 'POST', url: '/v1/invites', headers: auth })).json<{ code: string }>();
    const page = await app.inject({ url: `/i/${code}`, headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' } });
    assert.equal(page.statusCode, 200);
    assert.doesNotMatch(page.body, /evil\.example/);
    assert.match(page.body, new RegExp(`https://hanged\\.example/i/${code}`));
    assert.match(String(page.headers['cache-control']), /^private/);
  });

  it("closes a deleted account's live socket", async () => {
    const p = (await register('2.2.2.2', '192.0.2.2')).json<RegisterResponse>();
    const ws = new WebSocket(`ws://${base}/v1/live`);
    const got: ServerMessage[] = [];
    ws.on('message', (d) => got.push(JSON.parse(String(d))));
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ t: 'auth', id: p.id, secret: p.secret, v: VERSUS_PROTOCOL }));
    while (!got.some((m) => m.t === 'hello')) await new Promise((r) => setTimeout(r, 10));
    const closed = new Promise<number>((r) => ws.once('close', r));
    const del = await app.inject({ method: 'DELETE', url: '/v1/players/me', headers: { authorization: `Bearer ${p.id}:${p.secret}` } });
    assert.equal(del.statusCode, 204);
    assert.equal(await closed, 4002);
    assert.ok(got.some((m) => m.t === 'bye' && m.reason === 'auth'));
    assert.equal(app.hub.counts().online, 0);
  });

  it('never keeps a socket that closed while it was signing in', async () => {
    const id = randomUUID();
    const secret = 's'.repeat(43);
    const ws = new FakeSocket();
    // The friends list is read after the player: the socket goes right then
    const fake: Db = {
      query: async <R>(text: string) => {
        if (text.includes('FROM friends')) ws.drop();
        const row = { secret_hash: createHash('sha256').update(secret).digest('hex'), id, name: 'Ghost', characterId: 'mochi', rating: 1000, played: 0, won: 0, role: null };
        return { rows: (text.includes('secret_hash') ? [row] : []) as R[] };
      },
      exec: async () => {},
      tx: <T>(fn: (sql: Sql) => Promise<T>) => fn(fake),
      close: async () => {},
    };
    const hub = new Hub({ db: fake, words: fakeWords(), status: { enabled: true, message: null }, clock: new FakeClock() });
    hub.attach(ws as unknown as WebSocket);
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'auth', id, secret, v: VERSUS_PROTOCOL })), false);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(hub.counts().online, 0);
    hub.close();
  });
});

/** Just enough of a ws socket for the hub. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  send() {}
  ping() {}
  close() {
    this.drop();
  }
  terminate() {
    this.drop();
  }
  drop() {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit('close');
  }
}
