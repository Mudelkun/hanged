import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { buildApp } from '../src/app.ts';
import type { LeaderboardResponse, PlayerSnapshot, RegisterResponse, RoundReport, SyncResponse } from '../src/contract.ts';
import { embedded, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { cleanName, nextScore } from '../src/players.ts';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  db = await embedded();
  await migrate(db);
  app = await buildApp(db, { boardTtlMs: 0 });
});
after(async () => {
  await app.close();
  await db.close();
});
beforeEach(() => db.exec('TRUNCATE players, player_weeks, word_days, words CASCADE'));

const snapshot = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  name: 'Roda',
  characterId: 'mochi',
  language: 'en',
  wordsGuessed: 0,
  level: 1,
  tokens: 3,
  ...over,
});

const report = (seq: number, over: Partial<RoundReport> = {}): RoundReport => ({
  seq,
  wordId: 'en-castle',
  level: 1,
  won: true,
  wrong: 2,
  description: false,
  letters: false,
  at: Date.now(),
  ...over,
});

async function newPlayer() {
  const res = await app.inject({ method: 'POST', url: '/v1/players' });
  assert.equal(res.statusCode, 201);
  return res.json<RegisterResponse>();
}

const sync = (p: RegisterResponse, player: PlayerSnapshot, reports: RoundReport[] = []) =>
  app.inject({ method: 'POST', url: '/v1/sync', headers: { authorization: `Bearer ${p.id}:${p.secret}` }, payload: { player, reports } });

const board = async (period: 'week' | 'all', me?: string) =>
  (await app.inject({ url: `/v1/leaderboard?period=${period}${me ? `&me=${me}` : ''}` })).json<LeaderboardResponse>();

describe('sync', () => {
  it('rejects a wrong secret', async () => {
    const p = await newPlayer();
    const res = await sync({ ...p, secret: 'x'.repeat(43) }, snapshot());
    assert.equal(res.statusCode, 401);
  });

  it('rejects a malformed report', async () => {
    const p = await newPlayer();
    assert.equal((await sync(p, snapshot(), [report(1, { wordId: 'Castle!' })])).statusCode, 400);
  });

  it('takes the first snapshot as it is, then grows only with reported wins', async () => {
    const p = await newPlayer();
    // played 40 words before syncing existed
    assert.equal((await sync(p, snapshot({ wordsGuessed: 40 }))).json<SyncResponse>().wordsGuessed, 40);
    // claims 1000 with one reported win: only the win counts
    const res = (await sync(p, snapshot({ wordsGuessed: 1000 }), [report(1)])).json<SyncResponse>();
    assert.deepEqual(res, { acked: 1, wordsGuessed: 41 });
  });

  it('counts a report once, even when sent again', async () => {
    const p = await newPlayer();
    await sync(p, snapshot());
    await sync(p, snapshot({ wordsGuessed: 2 }), [report(1), report(2, { won: false })]);
    const again = (await sync(p, snapshot({ wordsGuessed: 2 }), [report(1), report(2, { won: false }), report(3)])).json<SyncResponse>();
    assert.deepEqual(again, { acked: 3, wordsGuessed: 2 });
    const { rows } = await db.query<{ played: number; won: number }>(`SELECT played, won FROM word_stats WHERE word_id = 'en-castle'`);
    assert.deepEqual(rows, [{ played: 3, won: 2 }]);
  });

  it('adds word statistics and cleans the name', async () => {
    const p = await newPlayer();
    await db.query(`INSERT INTO words (id, word, language) VALUES ('en-castle', 'castle', 'en')`);
    await sync(p, snapshot({ name: '  Ro\u0007da   B ' }), [
      report(1, { wrong: 4, description: true }),
      report(2, { won: false, wrong: 10, letters: true }),
    ]);
    const { rows } = await db.query(`SELECT word, length, played, won, lost, avg_wrong, descriptions, letters FROM word_stats`);
    assert.deepEqual(rows, [{ word: 'castle', length: 6, played: 2, won: 1, lost: 1, avg_wrong: '7.00', descriptions: 1, letters: 1 }]);
    assert.equal((await db.query<{ name: string }>('SELECT name FROM players')).rows[0].name, 'Roda B');
  });
});

describe('leaderboard', () => {
  it('ranks by words guessed, then level, and gives my rank', async () => {
    const [a, b, c] = [await newPlayer(), await newPlayer(), await newPlayer()];
    await sync(a, snapshot({ name: 'A', wordsGuessed: 10, level: 2 }));
    await sync(b, snapshot({ name: 'B', wordsGuessed: 30 }));
    await sync(c, snapshot({ name: 'C', wordsGuessed: 10, level: 3 }));
    const res = await board('all', a.id);
    assert.deepEqual(
      res.entries.map((e) => [e.rank, e.name, e.words]),
      [[1, 'B', 30], [2, 'C', 10], [3, 'A', 10]],
    );
    assert.deepEqual(res.me, { rank: 3, words: 10 });
  });

  it('counts this week from reported wins only, and skips players without one', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    await sync(a, snapshot({ wordsGuessed: 50 }));
    await sync(a, snapshot({ wordsGuessed: 51 }), [report(1)]);
    const lastWeek = Date.now() - 8 * 24 * 3600 * 1000;
    await sync(b, snapshot());
    await sync(b, snapshot({ wordsGuessed: 2 }), [report(1, { at: lastWeek }), report(2)]);
    const res = await board('week', b.id);
    assert.deepEqual(res.entries.map((e) => e.words), [1, 1]);
    // a won first
    assert.deepEqual(res.entries[0].playerId, a.id);
    assert.deepEqual(res.me, { rank: 2, words: 1 });
  });

  it('has no rank for a player without words', async () => {
    const p = await newPlayer();
    await sync(p, snapshot());
    assert.equal((await board('all', p.id)).me, null);
    assert.equal((await board('week', p.id)).me, null);
  });
});

describe('rules', () => {
  it('nextScore', () => {
    assert.equal(nextScore(5, true, 3, 0), 3);
    assert.equal(nextScore(5, false, 3, 0), 5);
    assert.equal(nextScore(5, false, 9, 2), 7);
    assert.equal(nextScore(5, false, 6, 2), 6);
  });

  it('cleanName', () => {
    assert.equal(cleanName('   '), null);
    assert.equal(cleanName(null), null);
    assert.equal(cleanName(' Zoé\n '), 'Zoé');
  });
});
