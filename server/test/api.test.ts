import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { buildApp } from '../src/app.ts';
import type { LeaderboardResponse, PlayerSnapshot, RegisterResponse, RoundReport, SyncResponse } from '../src/contract.ts';
import { embedded, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { nameVariants } from '../src/names.ts';
import { nextScore, WIN_REFILL_MS, winBudget, withinBudget } from '../src/players.ts';
import { seedWords } from '../src/words.ts';

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  db = await embedded();
  await migrate(db);
  app = await buildApp(db, { boardTtlMs: 0, newPlayersPerHour: 1_000 });
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

  it('syncs accented word IDs from every supported language and counts retries once', async () => {
    const p = await newPlayer();
    await sync(p, snapshot());
    const reports = ['fr-été', 'fr-sœur', 'es-niño', 'de-straße'].map((wordId, i) => report(i + 1, { wordId }));
    for (let i = 0; i < 2; i++) {
      const res = await sync(p, snapshot({ language: 'de', wordsGuessed: 4 }), reports);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json<SyncResponse>(), { acked: 4, wordsGuessed: 4, name: 'Roda', role: null });
    }
    const { rows } = await db.query<{ word_id: string; played: number }>('SELECT word_id, played FROM word_days ORDER BY word_id');
    assert.equal(rows.length, 4);
    assert.ok(rows.every(row => row.played === 1));
    for (const wordId of ['en-éclair', 'fr-niño', 'de-house!', 'es-dos palabras']) {
      assert.equal((await sync(p, snapshot(), [report(5, { wordId })])).statusCode, 400);
    }
  });

  it("never takes the device's own count, not even on the first sync: only reported wins", async () => {
    const p = await newPlayer();
    // a new account claiming 10 million words
    assert.equal((await sync(p, snapshot({ wordsGuessed: 10_000_000 }))).json<SyncResponse>().wordsGuessed, 0);
    // claims 1000 with one reported win: only the win counts
    const res = (await sync(p, snapshot({ wordsGuessed: 1000 }), [report(1)])).json<SyncResponse>();
    assert.deepEqual(res, { acked: 1, wordsGuessed: 1, name: 'Roda', role: null });
  });

  it('takes every round a new account played offline before its first sync', async () => {
    const p = await newPlayer();
    const offline = Array.from({ length: 600 }, (_, i) => report(i + 1));
    let res: SyncResponse | undefined;
    for (let from = 0; from < offline.length; from += 200)
      res = (await sync(p, snapshot({ wordsGuessed: 600 }), offline.slice(from, from + 200))).json<SyncResponse>();
    assert.deepEqual(res, { acked: 600, wordsGuessed: 600, name: 'Roda', role: null });
  });

  it('drops wins reported faster than anyone plays, but keeps the losses and acks them all', async () => {
    const p = await newPlayer();
    // the budget is spent: a modified app sent thousands of wins just now
    await db.query('UPDATE players SET wins_tat = $2 WHERE id = $1', [p.id, Date.now()]);
    const res = (await sync(p, snapshot({ wordsGuessed: 3 }), [report(1), report(2, { won: false }), report(3)])).json<SyncResponse>();
    assert.deepEqual(res, { acked: 3, wordsGuessed: 0, name: 'Roda', role: null });
    const { rows } = await db.query<{ played: number; won: number }>(`SELECT played, won FROM word_stats WHERE word_id = 'en-castle'`);
    assert.deepEqual(rows, [{ played: 1, won: 0 }]);
    // time refills it: two wins' worth later, two count
    await db.query('UPDATE players SET wins_tat = $2 WHERE id = $1', [p.id, Date.now() - 2 * WIN_REFILL_MS]);
    const later = (await sync(p, snapshot({ wordsGuessed: 3 }), [report(4), report(5), report(6)])).json<SyncResponse>();
    assert.equal(later.wordsGuessed, 2);
  });

  it('counts a report once, even when sent again', async () => {
    const p = await newPlayer();
    await sync(p, snapshot());
    await sync(p, snapshot({ wordsGuessed: 2 }), [report(1), report(2, { won: false })]);
    const again = (await sync(p, snapshot({ wordsGuessed: 2 }), [report(1), report(2, { won: false }), report(3)])).json<SyncResponse>();
    assert.deepEqual(again, { acked: 3, wordsGuessed: 2, name: 'Roda', role: null });
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

  it('seeds every language pack, accents included, and rejects letters of another language', async () => {
    const seeded = await seedWords(db);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM words');
    assert.equal(rows[0].n, seeded);
    const { rows: [zebra] } = await db.query<{ word: string; length: number }>(`SELECT word, length FROM words WHERE id = 'fr-zèbre'`);
    assert.deepEqual({ ...zebra }, { word: 'zèbre', length: 5 });
    await assert.rejects(db.query(`INSERT INTO words (id, word, language) VALUES ('en-niño', 'niño', 'en')`), /words_word_check/);
  });
});

describe('leaderboard', () => {
  const winsAt = (from: number, wins: number, over: Partial<RoundReport> = {}) =>
    Array.from({ length: wins }, (_, i) => report(from + i, over));

  it('ranks by words guessed, then level, and gives my rank', async () => {
    const [a, b, c] = [await newPlayer(), await newPlayer(), await newPlayer()];
    await sync(a, snapshot({ name: 'Ann', wordsGuessed: 10, level: 2 }), winsAt(1, 10));
    await sync(b, snapshot({ name: 'Bea', wordsGuessed: 30 }), winsAt(1, 30));
    await sync(c, snapshot({ name: 'Cal', wordsGuessed: 10, level: 3 }), winsAt(1, 10));
    const res = await board('all', a.id);
    assert.deepEqual(
      res.entries.map((e) => [e.rank, e.name, e.words]),
      [[1, 'Bea', 30], [2, 'Cal', 10], [3, 'Ann', 10]],
    );
    assert.deepEqual(res.me, { rank: 3, words: 10 });
  });

  it('breaks a tie on words and level by tokens earned, then fewer misses, then who got there first', async () => {
    const [a, b, c, d] = [await newPlayer(), await newPlayer(), await newPlayer(), await newPlayer()];
    for (const p of [a, b, c, d]) await sync(p, snapshot({ name: null }));
    await sync(a, snapshot({ name: 'Ann', wordsGuessed: 2 }), winsAt(1, 2, { tokens: 2, wrong: 5 }));
    await sync(b, snapshot({ name: 'Bea', wordsGuessed: 2 }), winsAt(1, 2, { tokens: 3, wrong: 9 }));
    await sync(c, snapshot({ name: 'Cal', wordsGuessed: 2 }), winsAt(1, 2, { tokens: 2, wrong: 1 }));
    // Same as Cal in every way, but later
    await sync(d, snapshot({ name: 'Dee', wordsGuessed: 2 }), winsAt(1, 2, { tokens: 2, wrong: 1 }));
    for (const period of ['all', 'week'] as const) {
      const res = await board(period, a.id);
      assert.deepEqual(res.entries.map((e) => e.name), ['Bea', 'Cal', 'Dee', 'Ann'], period);
      assert.deepEqual(res.me, { rank: 4, words: 2 }, period);
    }
  });

  it("never lowers a rank for spending: the balance doesn't count, tokens earned do", async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    await sync(a, snapshot({ name: 'Ann', wordsGuessed: 1, tokens: 500 }), [report(1, { tokens: 1 })]);
    await sync(b, snapshot({ name: 'Bea', wordsGuessed: 1, tokens: 0 }), [report(1, { tokens: 4 })]);
    assert.deepEqual((await board('all')).entries.map((e) => e.name), ['Bea', 'Ann']);
  });

  it("ranks this week by the highest level played that week, and counts lost rounds' misses", async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    await sync(a, snapshot({ name: 'Ann', wordsGuessed: 1 }), [report(1, { level: 5, won: false }), report(2, { level: 4, wrong: 0 })]);
    await sync(b, snapshot({ name: 'Bea', wordsGuessed: 1, level: 9 }), [report(1, { level: 4, wrong: 0 })]);
    assert.deepEqual((await board('week')).entries.map((e) => e.name), ['Ann', 'Bea']);
    // All time uses the current level
    assert.deepEqual((await board('all')).entries.map((e) => e.name), ['Bea', 'Ann']);
    const { rows } = await db.query<{ misses: number }>('SELECT misses FROM player_weeks WHERE player_id = $1', [a.id]);
    assert.deepEqual(rows.map((r) => r.misses), [2]);
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
    await sync(p, snapshot(), [report(1, { won: false })]);
    assert.equal((await board('all', p.id)).me, null);
    assert.equal((await board('week', p.id)).me, null);
  });
});

describe('names', () => {
  const nameOf = async (id: string) =>
    (await db.query<{ name: string | null }>('SELECT name FROM players WHERE id = $1', [id])).rows[0].name;

  it('keeps a clean name, tidied', async () => {
    const p = await newPlayer();
    await sync(p, snapshot({ name: '  Sunny   Owl ' }));
    assert.equal(await nameOf(p.id), 'Sunny Owl');
  });

  it('drops a name that is too long, but still takes the sync', async () => {
    const p = await newPlayer();
    const res = await sync(p, snapshot({ name: 'Roda The Goat Forever', wordsGuessed: 1 }), [report(1)]);
    assert.equal(res.statusCode, 200);
    assert.equal(await nameOf(p.id), null);
  });

  it('drops a name the filter refuses, even if the app let it through', async () => {
    const p = await newPlayer();
    await sync(p, snapshot({ name: 'BigDick' }));
    assert.equal(await nameOf(p.id), null);
  });
});

describe('unique names', () => {
  const available = async (name: string, me?: RegisterResponse) =>
    (
      await app.inject({
        url: `/v1/names/available?name=${encodeURIComponent(name)}`,
        headers: me ? { authorization: `Bearer ${me.id}:${me.secret}` } : {},
      })
    ).json<{ available: boolean }>().available;

  it('gives a taken name the first free variant, however it is spelled', async () => {
    const [a, b, c] = [await newPlayer(), await newPlayer(), await newPlayer()];
    assert.equal((await sync(a, snapshot({ name: 'Zoë' }))).json<SyncResponse>().name, 'Zoë');
    assert.equal((await sync(b, snapshot({ name: 'zoe' }))).json<SyncResponse>().name, 'zoe2');
    assert.equal((await sync(c, snapshot({ name: 'Z-O-E' }))).json<SyncResponse>().name, 'Z-O-E3');
    // A player keeps their own name, and may change its case
    assert.equal((await sync(a, snapshot({ name: 'ZOË' }))).json<SyncResponse>().name, 'ZOË');
    // Once b moves on, the name is free again
    await sync(b, snapshot({ name: 'Bea' }));
    assert.equal((await sync(c, snapshot({ name: 'zoe2' }))).json<SyncResponse>().name, 'zoe2');
  });

  it('says whether a name is free, counting my own as free', async () => {
    const p = await newPlayer();
    await sync(p, snapshot({ name: 'Sunny Otter' }));
    assert.equal(await available('sunnyotter'), false);
    assert.equal(await available('SunnyOtter', p), true);
    // older apps send a bare id: it still counts as their own
    assert.equal((await app.inject({ url: `/v1/names/available?name=SunnyOtter&me=${p.id}` })).json<{ available: boolean }>().available, true);
    assert.equal(await available('Sunny Owl'), true);
    // A name the rules refuse is never available
    assert.equal(await available('x'), false);
  });

  it('cuts a variant so it fits the limit', () => {
    assert.deepEqual(nameVariants('Roda', 2, 3), ['Roda2', 'Roda3']);
    assert.deepEqual(nameVariants('Maximilianusxyz', 9, 10), ['Maximilianusxy9', 'Maximilianusx10']);
    assert.deepEqual(nameVariants('Ana Maria Lopez', 10, 10), ['Ana Maria Lop10']);
    assert.deepEqual(nameVariants('Ana Mariaaaa Lo', 10, 10), ['Ana Mariaaaa10']);
  });
});

describe('delete account', () => {
  const del = (p: RegisterResponse) =>
    app.inject({ method: 'DELETE', url: '/v1/players/me', headers: { authorization: `Bearer ${p.id}:${p.secret}` } });

  it('needs the secret', async () => {
    const p = await newPlayer();
    assert.equal((await del({ ...p, secret: 'x'.repeat(43) })).statusCode, 401);
    assert.equal((await app.inject({ method: 'DELETE', url: '/v1/players/me' })).statusCode, 401);
  });

  it('removes the player and their weeks, keeps the word statistics', async () => {
    const p = await newPlayer();
    await sync(p, snapshot({ wordsGuessed: 1 }), [report(1)]);
    assert.equal((await del(p)).statusCode, 204);
    assert.deepEqual((await board('all')).entries, []);
    assert.deepEqual((await board('week')).entries, []);
    assert.equal((await db.query('SELECT 1 FROM player_weeks')).rows.length, 0);
    assert.equal((await db.query('SELECT 1 FROM word_days')).rows.length, 1);
    // the device's old account is gone: its next sync starts over
    assert.equal((await sync(p, snapshot())).statusCode, 401);
    assert.equal((await del(p)).statusCode, 401);
  });
});

describe('rules', () => {
  it('nextScore', () => {
    assert.equal(nextScore(0, 3, 0), 0);
    assert.equal(nextScore(5, 3, 0), 5);
    assert.equal(nextScore(5, 9, 2), 7);
    assert.equal(nextScore(5, 6, 2), 6);
  });

  it('winBudget: full when never spent, empty once spent, refilled by time, never past the cap', () => {
    const now = 1_000_000_000;
    assert.equal(winBudget(null, now, 10, 50).allowed, 50);
    const spent = winBudget(null, now, 10, 50).spend(50);
    assert.equal(winBudget(spent, now, 10, 50).allowed, 0);
    assert.equal(winBudget(spent, now + 35, 10, 50).allowed, 3);
    assert.equal(winBudget(spent, now + 10_000, 10, 50).allowed, 50);
    // a tat in the future (spent past now) allows nothing
    assert.equal(winBudget(now + 100, now, 10, 50).allowed, 0);
  });

  it('withinBudget keeps every loss and the first wins', () => {
    const rs = [report(1), report(2, { won: false }), report(3), report(4)];
    assert.deepEqual(withinBudget(rs, 1).map((r) => r.seq), [1, 2]);
    assert.deepEqual(withinBudget(rs, 0).map((r) => r.seq), [2]);
  });
});
