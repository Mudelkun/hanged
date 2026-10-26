import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { checkName } from '../src/names.ts';
import { type MatchResult, MODES, type ModeId, VERSUS_LIMITS } from '../src/versus-contract.ts';
import { Bot, BOT_CHARACTERS, BOT_TUNING, botName, botsFor, botStyle } from '../src/versus/bots.ts';
import { createMatch, type Match } from '../src/versus/match.ts';
import { BOT_WAIT_MS, botWait, FILL_WAIT_MS, Matchmaker } from '../src/versus/matchmaker.ts';
import { FakeClock, fakeWords, seeded } from './versus-helpers.ts';

/** A match of bots only, each of the given skill; returns what happened, with every guess's time. */
function botMatch(mode: ModeId, skills: number[], seed = 1) {
  const clock = new FakeClock();
  const rng = seeded(seed);
  const bots = new Map<string, Bot>();
  const guesses: { id: string; at: number }[] = [];
  let result: MatchResult | null = null;
  const host = {
    clock,
    rng,
    words: fakeWords(),
    send: (id: string, msg: Parameters<Bot['receive']>[0]) => bots.get(id)?.receive(msg),
    left() {},
    ended: (_m: Match, r: MatchResult) => {
      result = r;
    },
  };
  const list = skills.map((skill, i) => new Bot({ id: `b${i}`, name: `B${i}`, characterId: 'mochi', rating: 1000, bot: true }, { ...botStyle(1000, 10, rng), skill }, host));
  for (const b of list) bots.set(b.seat.id, b);
  const match = createMatch(host, mode, list.map((b) => b.seat), false, 'en');
  const judge = match.guess.bind(match);
  match.guess = (id, n, letter) => {
    guesses.push({ id, at: clock.now() });
    judge(id, n, letter);
  };
  for (const b of list) b.sit(match);
  match.start();
  return { clock, match, guesses, result: () => result as MatchResult | null };
}

describe('bots', () => {
  it('play every mode to the end through the same calls as a device', () => {
    for (const mode of ['rush', 'battle', 'duel'] as const) {
      const { clock, result, guesses } = botMatch(mode, [0.5, 0.5]);
      clock.advance(20 * 60_000);
      assert.equal(result()?.reason, 'done', mode);
      assert.ok(guesses.length > 4, mode);
      assert.ok(result()!.standings.some((s) => s.words > 0), mode);
    }
  });

  it('give a duel card before the pick deadline', () => {
    const { clock, match } = botMatch('duel', [0.5, 0.5]);
    clock.advance(VERSUS_LIMITS.countdownMs);
    assert.equal(match.phase, 'pick');
    clock.advance(MODES.duel.pickMs - 1);
    assert.equal(match.phase, 'play');
  });

  it('think like people: never instantly, never on a beat, slower on a new word', () => {
    const { clock, guesses } = botMatch('rush', [0.5]);
    clock.advance(MODES.rush.durationMs + VERSUS_LIMITS.countdownMs);
    const gaps = guesses.slice(1).map((g, i) => g.at - guesses[i].at);
    assert.ok(gaps.length > 20);
    assert.ok(Math.min(...gaps) >= BOT_TUNING.minThinkMs);
    assert.ok(new Set(gaps).size > gaps.length * 0.8, 'think times vary');
    // The first guess comes after reading the word
    assert.ok(guesses[0].at - VERSUS_LIMITS.countdownMs - 1_000_000 > BOT_TUNING.minThinkMs * 2);
  });

  it('a stronger bot wins most matches, so skill (from the rating) sets how hard a bot is', () => {
    for (const mode of ['rush', 'duel'] as const) {
      let strong = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const { clock, result } = botMatch(mode, [0.15, 0.9], seed * 101);
        clock.advance(20 * 60_000);
        if (result()!.standings[0].id === 'b1') strong++;
      }
      assert.ok(strong >= 24, `${mode}: ${strong}/30`);
    }
  });

  it('get stronger with the rating, gentler for a new player, always within bounds', () => {
    const rng = seeded(7);
    const mean = (rating: number, played: number) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += botStyle(rating, played, rng).skill;
      return sum / 200;
    };
    assert.ok(mean(1300, 50) > mean(1000, 50) + 0.2);
    assert.ok(mean(1000, 0) < mean(1000, 50) - 0.05);
    for (let i = 0; i < 500; i++) {
      const s = botStyle(100 + i * 10, i % 10, rng).skill;
      assert.ok(s >= BOT_TUNING.minSkill && s <= BOT_TUNING.maxSkill);
    }
  });

  it('get names players could have: valid, varied, and never the player’s own', () => {
    const rng = seeded(3);
    for (const language of ['en', 'fr', 'es', 'de']) {
      const names = Array.from({ length: 1_500 }, () => botName(language, rng));
      for (const name of names) assert.deepEqual(checkName(name), { ok: true, name }, name);
      assert.ok(new Set(names).size > 600, language);
    }
    for (let i = 0; i < 200; i++) {
      const bots = botsFor('rush', 'en', { name: 'Maya', rating: 1000, played: 10 }, { clock: new FakeClock(), rng, words: fakeWords() });
      const keys = bots.map((b) => b.seat.name!.toLowerCase());
      assert.ok(!keys.includes('maya'));
      assert.equal(new Set(keys).size, keys.length);
      assert.ok(bots.length >= 1 && bots.length <= MODES.rush.maxPlayers - 1);
      for (const b of bots) assert.ok(b.seat.bot && Math.abs(b.seat.rating - 1000) < 250);
    }
    assert.equal(botsFor('duel', 'en', { name: null, rating: 1000, played: 0 }, { clock: new FakeClock(), rng, words: fakeWords() }).length, 1);
  });

  it('wear every character of the rig, and only those', async () => {
    const rig = await readFile(new URL('../../design/characters/rig.js', import.meta.url), 'utf8');
    const ids = [...rig.matchAll(/id: '(\w+)', name: '[^']+', species:/g)].map((m) => m[1]).sort();
    assert.deepEqual([...BOT_CHARACTERS.free, ...BOT_CHARACTERS.paid].sort(), ids);
  });
});

describe('matchmaking with bots', () => {
  const never = () => false;

  it('gives a lone waiter bots only once their wait is over', () => {
    const mm = new Matchmaker(never);
    mm.join('duel', 'en', { id: 'a', rating: 1000, since: 0, botAt: 12_000 });
    assert.deepEqual(mm.tick(11_999), []);
    assert.deepEqual(mm.tick(12_000), [{ mode: 'duel', language: 'en', ids: ['a'], bots: true }]);
    assert.equal(mm.size, 0);
  });

  it('always prefers a real player, even past the bot wait', () => {
    const mm = new Matchmaker(never);
    mm.join('rush', 'en', { id: 'a', rating: 1000, since: 0, botAt: 10_000 });
    mm.join('rush', 'en', { id: 'b', rating: 1050, since: 9_500, botAt: 20_000 });
    assert.deepEqual(mm.tick(10_000), [{ mode: 'rush', language: 'en', ids: ['a', 'b'] }]);
  });

  it('waits for players only without a bot time', () => {
    const mm = new Matchmaker(never);
    mm.join('duel', 'en', { id: 'a', rating: 1000, since: 0 });
    assert.deepEqual(mm.tick(10 * 60_000), []);
  });

  it('draws the bot wait in its range, after the fill wait', () => {
    const rng = seeded(5);
    for (let i = 0; i < 100; i++) {
      const ms = botWait(rng);
      assert.ok(ms >= BOT_WAIT_MS.min && ms <= BOT_WAIT_MS.max);
    }
    assert.ok(BOT_WAIT_MS.min > FILL_WAIT_MS);
  });
});
