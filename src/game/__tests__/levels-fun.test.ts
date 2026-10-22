/*
 * The owner's goal: a regular person wins about 3 rounds in 4 on levels 1–15,
 * and still more than they lose on the summit levels 16–20. The stand-in for a
 * regular person is a simulated player who recognises no words and just tries
 * the most frequent letters (no hints, no subject, no description), playing
 * real rounds of each level. A smarter word-matching model said "easy" while the
 * owner kept losing, so this one is the yardstick. Run it before making a level
 * harder: the numbers in levels.ts are tuned against it
 * (Context/progression-and-tokens.md).
 */
import { LETTER_FREQUENCY } from '../config';
import { createRound, guess, roundStatus, usedLetters } from '../engine';
import { clueRatioFor, LEVELS, Level } from '../levels';
import { levelPool } from '../words';

/** Owner's target (2026-10-22): about 75% on levels 1–15; the summit only has to stay winnable. */
const REGULAR_LEVELS = 15;
const minWinRate = (level: Level) => (level.level <= REGULAR_LEVELS ? 0.75 : 0.5);
/** Enough words that a player goes a long while before a level starts over. */
const MIN_POOL = 250;
const ROUNDS = 300;

/** A seeded generator, so the test always plays the same rounds. */
const seeded = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

function winRate(level: Level): number {
  const rng = seeded(level.level);
  const pool = levelPool(level, 'en');
  let wins = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const w = pool[Math.floor(rng() * pool.length)];
    let r = createRound(
      { ...w, wordId: w.id, id: 'r', level: level.level, clueRatio: clueRatioFor(level, w), rareClues: level.rareClues, disabledRatio: level.disabledRatio, maxWrong: level.maxWrong },
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
  it.each(LEVELS.map((l) => [l.level, l] as const))('level %i: a regular player wins often enough', (_, level) => {
    expect(levelPool(level, 'en').length).toBeGreaterThanOrEqual(MIN_POOL);
    expect(winRate(level)).toBeGreaterThanOrEqual(minWinRate(level));
  });
});
