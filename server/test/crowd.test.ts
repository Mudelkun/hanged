import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { buildApp } from '../src/app.ts';
import type { LeaderboardResponse, RegisterResponse } from '../src/contract.ts';
import { advanceCrowd, CROWD, fillCrowd, persona, play } from '../src/crowd.ts';
import { embedded, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { checkName } from '../src/names.ts';
import { report, search, sendRequest } from '../src/versus/store.ts';
import { BOT_CHARACTERS } from '../src/versus/bots.ts';
import { seeded } from './versus-helpers.ts';

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
beforeEach(() => db.exec('TRUNCATE players, player_weeks, word_days CASCADE'));

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 28, 18); // a Wednesday evening

const bots = async () =>
  (await db.query<{ id: string; name: string; character_id: string; words_guessed: number; level: number; synced_at: Date }>(
    'SELECT id, name, character_id, words_guessed, level, synced_at FROM players WHERE bot ORDER BY id',
  )).rows;
const board = async (period: 'week' | 'all', me?: string) =>
  (await app.inject({ url: `/v1/leaderboard?period=${period}${me ? `&me=${me}` : ''}` })).json<LeaderboardResponse>();

async function newPlayer() {
  return (await app.inject({ method: 'POST', url: '/v1/players' })).json<RegisterResponse>();
}

describe('leaderboard bots', () => {
  it('draws the same persona for an id, and plays the same days', () => {
    const id = '0b7e3c1a-1111-4222-8333-444455556666';
    assert.deepEqual(persona(id), persona(id));
    const p = persona(id);
    assert.ok(p.perDay >= CROWD.perDay.min && p.perDay <= CROWD.perDay.max);
    assert.ok(p.ceiling >= CROWD.ceiling[0] && p.ceiling <= CROWD.ceiling[1]);
    // Over a month, a bot plays about its share of days, at about its pace.
    const month = play(id, p, 0, NOW - 30 * 24 * HOUR, NOW, seeded(1));
    const days = new Set(month.map((s) => Math.floor((s.at + p.tz * HOUR) / (24 * HOUR)))).size;
    assert.ok(days > 0 && days <= 31);
    for (const s of month) assert.ok(s.level >= 1 && s.level <= p.ceiling && s.at >= NOW - 30 * 24 * HOUR && s.at < NOW);
  });

  it('fills the boards with players who joined weeks ago, as players look', async () => {
    assert.equal(await fillCrowd(db, 30, NOW, seeded(2)), 30);
    await advanceCrowd(db, NOW, seeded(3));
    const rows = await bots();
    assert.equal(rows.length, 30);
    assert.equal(new Set(rows.map((r) => r.name.toLowerCase())).size, 30);
    const characters: readonly string[] = [...BOT_CHARACTERS.free, ...BOT_CHARACTERS.paid];
    for (const r of rows) {
      assert.equal(checkName(r.name).ok, true, r.name);
      assert.ok(characters.includes(r.character_id));
      assert.equal(r.synced_at.getTime(), NOW);
    }
    const all = await board('all');
    assert.ok(all.entries.length >= 20, 'most have won words since they joined');
    assert.ok(all.entries[0].words > all.entries.at(-1)!.words);
    assert.ok((await board('week')).entries.length > 0, 'some played this week');
  });

  it('moves to a moment once: catching up again adds nothing', async () => {
    await fillCrowd(db, 20, NOW, seeded(4));
    await advanceCrowd(db, NOW, seeded(5));
    const before = await bots();
    assert.equal(await advanceCrowd(db, NOW, seeded(6)), 0);
    assert.deepEqual(await bots(), before);
    // A day later they've played on: scores only grow, levels follow them.
    assert.ok((await advanceCrowd(db, NOW + 24 * HOUR, seeded(7))) > 0);
    const later = await bots();
    later.forEach((r, i) => assert.ok(r.words_guessed >= before[i].words_guessed));
    const weeks = await db.query<{ words: number }>('SELECT sum(words)::int AS words FROM player_weeks');
    const total = later.reduce((n, r) => n + r.words_guessed, 0);
    assert.equal(weeks.rows[0].words, total, 'every word is in a week');
  });

  it('ranks a real player among them', async () => {
    await fillCrowd(db, 20, NOW, seeded(8));
    await advanceCrowd(db, NOW, seeded(9));
    const p = await newPlayer();
    const synced = await app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: { authorization: `Bearer ${p.id}:${p.secret}` },
      payload: {
        player: { name: 'Roda', characterId: 'mochi', language: 'en', wordsGuessed: 1, level: 1, tokens: 1 },
        reports: [{ seq: 1, wordId: 'en-castle', level: 1, won: true, wrong: 2, description: true, letters: false, at: Date.now() }],
      },
    });
    assert.equal(synced.statusCode, 200);
    const { me } = await board('all', p.id);
    const scores = (await bots()).map((r) => r.words_guessed);
    assert.equal(me?.words, 1);
    // Behind every bot with more words, ahead of every bot with fewer (ties go to the tiebreaks).
    assert.ok(me && me.rank > scores.filter((w) => w > 1).length && me.rank <= 1 + scores.filter((w) => w >= 1).length);
  });

  it("can't sign in, be found, befriended or reported", async () => {
    await fillCrowd(db, 5, NOW, seeded(10));
    const [bot] = await bots();
    const sync = await app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: { authorization: `Bearer ${bot.id}:${'x'.repeat(43)}` },
      payload: { player: { name: 'X', characterId: 'mochi', language: 'en', wordsGuessed: 0, level: 1, tokens: 0 }, reports: [] },
    });
    assert.equal(sync.statusCode, 401);
    const me = await newPlayer();
    assert.deepEqual((await search(db, me.id, bot.name)).players, []);
    assert.equal(await sendRequest(db, me.id, bot.id), 'notFound');
    assert.equal(await report(db, me.id, bot.id, 'name'), false);
  });

  it('starts with the server (LEADERBOARD_BOTS) and stops with it', async () => {
    const server = await buildApp(db, { crowd: 6 });
    await server.ready();
    await server.close(); // waits for the step in flight
    const rows = await bots();
    assert.equal(rows.length, 6);
    assert.ok(rows.every((r) => Date.now() - r.synced_at.getTime() < 60_000), 'played up to now');
  });

  it('keeps the size it is given: extra bots leave, 0 takes them all off', async () => {
    await fillCrowd(db, 12, NOW, seeded(11));
    assert.equal(await fillCrowd(db, 12, NOW, seeded(12)), 0);
    assert.equal(await fillCrowd(db, 8, NOW, seeded(13)), -4);
    assert.equal((await bots()).length, 8);
    await fillCrowd(db, 0, NOW);
    assert.equal((await bots()).length, 0);
  });
});
