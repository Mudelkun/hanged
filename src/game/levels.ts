/*
 * Progressive difficulty. The player never picks a level: it rises with the
 * number of words guessed and never drops back down.
 *
 * PLACEHOLDER: the owner has not decided the clue formula, the number of
 * levels or what moves a player up (see "Open questions" in CLAUDE.md).
 * Everything that drives difficulty lives in this one table.
 */
import { DEFAULT_MAX_WRONG, WORDS_PER_LEVEL } from './config';

export interface Level {
  level: number;
  /** Inclusive word-length range for solo words at this level. */
  minLength: number;
  maxLength: number;
  /** Share of the word's distinct letters revealed as clues (see engine.clueCount). */
  clueRatio: number;
  maxWrong: number;
}

export const LEVELS: readonly Level[] = [
  { level: 1, minLength: 3, maxLength: 5, clueRatio: 0.4, maxWrong: DEFAULT_MAX_WRONG },
  { level: 2, minLength: 4, maxLength: 6, clueRatio: 0.35, maxWrong: DEFAULT_MAX_WRONG },
  { level: 3, minLength: 5, maxLength: 7, clueRatio: 0.3, maxWrong: DEFAULT_MAX_WRONG },
  { level: 4, minLength: 6, maxLength: 8, clueRatio: 0.25, maxWrong: DEFAULT_MAX_WRONG },
  { level: 5, minLength: 7, maxLength: 9, clueRatio: 0.2, maxWrong: DEFAULT_MAX_WRONG },
  { level: 6, minLength: 8, maxLength: 11, clueRatio: 0.18, maxWrong: DEFAULT_MAX_WRONG },
  { level: 7, minLength: 9, maxLength: 13, clueRatio: 0.15, maxWrong: 8 },
  { level: 8, minLength: 10, maxLength: 15, clueRatio: 0.12, maxWrong: 6 },
];

export const levelNumberFor = (wordsGuessed: number) =>
  Math.min(LEVELS.length, 1 + Math.floor(wordsGuessed / WORDS_PER_LEVEL));

export const levelFor = (wordsGuessed: number): Level => LEVELS[levelNumberFor(wordsGuessed) - 1];
