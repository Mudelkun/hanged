/*
 * The owner's goal: a regular person wins about 3 rounds in 4 on levels 1–15,
 * and still more than they lose on the summit levels 16–20. Not much more,
 * either: a level everyone wins has no tension, so levels 3–20 also have a
 * ceiling (levels 1–2 teach the game and may be easier). The stand-in for a
 * regular person is a simulated player who recognises no words and just tries
 * the most frequent letters (no subject, no description), playing
 * real rounds of each level. A smarter word-matching model said "easy" while the
 * owner kept losing, so this one is the yardstick. Run it before making a level
 * harder: the numbers in levels.ts are tuned against it
 * (Context/progression-and-tokens.md).
 */
import { LETTER_FREQUENCY } from '../config';
import { createRound, guess, roundStatus, usedLetters } from '../engine';
import { LEVELS, Level } from '../levels';
import { levelPool } from '../words';

/** Owner's target (2026-10-22): about 75% on levels 1–15; the summit only has to stay winnable. */
const REGULAR_LEVELS = 15;
const minWinRate = (level: Level) => (level.level <= REGULAR_LEVELS ? 0.75 : 0.5);
/**
 * Too easy (2026-10-22: 90–97% felt like no contest). Levels 1–2 are the tutorial. The summit gets
 * harder through less familiar words, which this player can't tell from everyday ones (it recognises
 * none), so it gets the same ceiling: `the summit deals less and less familiar words` checks the rest.
 */
const TUTORIAL_LEVELS = 2;
const maxWinRate = (level: Level) => (level.level <= TUTORIAL_LEVELS ? 1 : 0.88);
/** Enough words that a player goes a long while before a level starts over. */
const MIN_POOL = 250;
const ROUNDS = 1000;

/** A seeded generator, so the test always plays the same rounds. */
const seeded = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

function winRate(level: Level): number {
  const rng = seeded(level.level);
  const pool = levelPool(level, 'en');
  let wins = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const w = pool[Math.floor(rng() * pool.length)];
    let r = createRound(
      { ...w, wordId: w.id, id: 'r', level: level.level, toFind: level.toFind, disabledRatio: level.disabledRatio, maxWrong: level.maxWrong },
      rng,
    );
    while (roundStatus(r) === 'playing') {
      const used = usedLetters(r);
      r = guess(r, [...LETTER_FREQUENCY.en].find((c) => !used.has(c))!);
    }
    if (roundStatus(r) === 'won') wins++;
  }
  return wins / ROUNDS;
}

describe('every level is fun', () => {
  it.each(LEVELS.map((l) => [l.level, l] as const))('level %i: a regular player wins often, but not always', (_, level) => {
    expect(levelPool(level, 'en').length).toBeGreaterThanOrEqual(MIN_POOL);
    const rate = winRate(level);
    expect(rate).toBeGreaterThanOrEqual(minWinRate(level));
    expect(rate).toBeLessThanOrEqual(maxWinRate(level));
  });

  /** Everyday words (WordEntry.rarity 10 or 20). */
  const familiarShare = (level: Level) => {
    const pool = levelPool(level, 'en');
    return pool.filter((w) => w.rarity <= 20).length / pool.length;
  };

  it("deals only everyday words up to level 15 (owner's call)", () => {
    for (const level of LEVELS.filter((l) => l.level <= REGULAR_LEVELS)) expect(familiarShare(level)).toBe(1);
  });

  it('the summit deals less and less familiar words, but still some everyday ones', () => {
    const summit = LEVELS.filter((l) => l.level > REGULAR_LEVELS).map(familiarShare);
    for (let i = 1; i < summit.length; i++) expect(summit[i]).toBeLessThan(summit[i - 1]);
    expect(summit[0]).toBeLessThan(1);
    expect(summit[summit.length - 1]).toBeGreaterThan(0.25);
  });
});
