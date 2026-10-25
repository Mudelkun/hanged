import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { buildApp } from '../src/app.ts';
import type { LeaderboardResponse, PlayerSnapshot, RegisterResponse, RoundReport, SyncResponse } from '../src/contract.ts';
import { embedded, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { checkName } from '../src/names.ts';
import { PLAY_POWERS, ROLES, roleCan } from '../src/roles.ts';
import type { StaffRow } from '../src/staff.ts';

const ADMIN = 'a'.repeat(32);
let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  db = await embedded();
  await migrate(db);
  app = await buildApp(db, { boardTtlMs: 0, newPlayersPerHour: 1_000, adminToken: ADMIN });
});
after(async () => {
  await app.close();
  await db.close();
});
beforeEach(() => db.exec('TRUNCATE players, player_weeks, word_days CASCADE'));

const snapshot = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  name: 'Roda', characterId: 'mochi', language: 'en', wordsGuessed: 0, level: 1, tokens: 3, ...over,
});
const win = (seq: number, over: Partial<RoundReport> = {}): RoundReport => ({
  seq, wordId: 'en-castle', level: 1, won: true, wrong: 2, tokens: 1, description: true, letters: false, at: Date.now(), ...over,
});

async function newPlayer() {
  return (await app.inject({ method: 'POST', url: '/v1/players' })).json<RegisterResponse>();
}
const sync = async (p: RegisterResponse, player: PlayerSnapshot, reports: RoundReport[] = []) =>
  (await app.inject({ method: 'POST', url: '/v1/sync', headers: { authorization: `Bearer ${p.id}:${p.secret}` }, payload: { player, reports } }))
    .json<SyncResponse>();
const board = async (period: 'week' | 'all', me?: string) =>
  (await app.inject({ url: `/v1/leaderboard?period=${period}${me ? `&me=${me}` : ''}` })).json<LeaderboardResponse>();
const available = async (name: string, me?: string) =>
  (await app.inject({ url: `/v1/names/available?name=${encodeURIComponent(name)}${me ? `&me=${me}` : ''}` })).json<{ available: boolean }>().available;

const admin = (method: 'GET' | 'PUT', url: string, payload?: object, token = ADMIN) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });
const setRole = (id: string, role: string | null) => admin('PUT', `/admin/api/staff/${id}`, { role });

describe('roles', () => {
  it('every role with a power over play is unranked', () => {
    for (const role of ROLES)
      if (PLAY_POWERS.some((p) => roleCan(role, p))) assert.ok(roleCan(role, 'unranked'), `${role} must be unranked`);
  });

  it('grants nothing to a regular player or a role the app does not know', () => {
    assert.equal(roleCan(null, 'allCharacters'), false);
    assert.equal(roleCan('owner' as never, 'allCharacters'), false);
    assert.equal(roleCan('admin', 'allCharacters'), true);
  });
});

describe('the admin page', () => {
  it('needs its token to list, find or change a role', async () => {
    const p = await newPlayer();
    assert.equal((await admin('GET', '/admin/api/staff', undefined, 'nope'.repeat(8))).statusCode, 401);
    assert.equal((await admin('PUT', `/admin/api/staff/${p.id}`, { role: 'admin' }, 'nope'.repeat(8))).statusCode, 401);
    assert.equal((await setRole(p.id, 'owner')).statusCode, 400);
    assert.equal((await setRole('00000000-0000-0000-0000-000000000000', 'admin')).statusCode, 404);
  });

  it('finds a player by name or id, and lists the accounts holding a role', async () => {
    const p = await newPlayer();
    await sync(p, snapshot({ name: 'Sunny Otter' }));
    const byName = (await admin('GET', '/admin/api/staff?q=sunnyot')).json<{ found: StaffRow[] }>();
    assert.deepEqual(byName.found.map((r) => r.id), [p.id]);
    const byId = (await admin('GET', `/admin/api/staff?q=${p.id.toUpperCase()}`)).json<{ found: StaffRow[] }>();
    assert.deepEqual(byId.found.map((r) => r.name), ['Sunny Otter']);
    const after = (await setRole(p.id, 'admin')).json<{ roles: string[]; staff: StaffRow[] }>();
    assert.deepEqual(after.roles, ROLES);
    assert.deepEqual(after.staff.map((r) => [r.id, r.role]), [[p.id, 'admin']]);
  });
});

describe('a developer account', () => {
  it('learns its role from the sync; nothing the device sends can give one', async () => {
    const p = await newPlayer();
    assert.equal((await sync(p, snapshot())).role, null);
    await setRole(p.id, 'admin');
    assert.equal((await sync(p, snapshot())).role, 'admin');
    await setRole(p.id, null);
    assert.equal((await sync(p, snapshot())).role, null);
  });

  it('alone may take the name "Admin", however it is written', async () => {
    const [dev, other] = [await newPlayer(), await newPlayer()];
    // Before the role, and for everyone else, it's a name the filter refuses
    assert.equal(checkName('Admin').ok, false);
    assert.equal((await sync(dev, snapshot({ name: 'Admin' }))).name, null);
    assert.equal(await available('Admin', dev.id), false);
    await setRole(dev.id, 'admin');
    assert.equal(await available('aDmIn', dev.id), true);
    assert.equal((await sync(dev, snapshot({ name: 'aDmIn' }))).name, 'aDmIn');
    assert.equal((await sync(other, snapshot({ name: 'ADMIN' }))).name, null);
    assert.equal((await sync(other, snapshot({ name: 'A.d.m.i.n' }))).name, null);
    assert.equal(await available('Admin', other.id), false);
    // Only the exact name is reserved: what contains it stays blocked even for the developer
    assert.equal((await sync(dev, snapshot({ name: 'AdminRoda' }))).name, null);
    // The role taken away, the name goes with it
    await sync(dev, snapshot({ name: 'Admin' }));
    await setRole(dev.id, null);
    assert.equal((await sync(dev, snapshot({ name: 'Admin' }))).name, null);
  });

  it('is on no board and counts no round, then comes back with only what it earned without the role', async () => {
    const [dev, other] = [await newPlayer(), await newPlayer()];
    await sync(dev, snapshot({ name: 'Dev', wordsGuessed: 3 }), [win(1), win(2), win(3)]);
    await sync(other, snapshot({ name: 'Bea', wordsGuessed: 1 }), [win(1)]);
    assert.equal((await board('week')).entries.length, 2);

    await setRole(dev.id, 'admin');
    for (const period of ['week', 'all'] as const) {
      const res = await board(period, dev.id);
      assert.deepEqual(res.entries.map((e) => [e.rank, e.name]), [[1, 'Bea']], period);
      assert.equal(res.me, null, period);
      assert.deepEqual((await board(period, other.id)).me, { rank: 1, words: 1 }, period);
    }
    // Rounds played with the role are acked (the device drops them) but never counted
    const res = await sync(dev, snapshot({ name: 'Dev', wordsGuessed: 50, level: 20 }), [win(4, { wordId: 'en-garden' }), win(5)]);
    assert.equal(res.acked, 5);
    assert.equal(res.wordsGuessed, 3);
    const { rows } = await db.query<{ word_id: string; played: number }>('SELECT word_id, played FROM word_days ORDER BY word_id');
    assert.deepEqual(rows, [{ word_id: 'en-castle', played: 4 }]);

    await setRole(dev.id, null);
    await sync(dev, snapshot({ name: 'Dev', wordsGuessed: 51 }), [win(6)]);
    const back = await board('all', dev.id);
    assert.deepEqual(back.entries.map((e) => [e.name, e.words]), [['Dev', 4], ['Bea', 1]]);
    // Tied with Bea, who got there first
    assert.deepEqual((await board('week', dev.id)).me, { rank: 2, words: 1 });
  });
});
