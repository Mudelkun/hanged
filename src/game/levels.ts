/*
 * Progressive difficulty. The player never picks a level: words guessed move
 * it up, and rounds lost in a row move it back down (`afterRound`).
 *
 * PLACEHOLDER: the owner has not decided the clue formula, the number of
 * levels or how many wins move a player up (see "Open questions" in CLAUDE.md).
 * Everything that drives difficulty lives in this one table.
 */
import { DEFAULT_MAX_WRONG, LEVEL_GRACE_ROUNDS, LOSSES_TO_DROP, WORDS_PER_LEVEL } from './config';

export interface Level {
  level: number;
  /** Inclusive word-length range for solo words at this level. */
  minLength: number;
  maxLength: number;
  /** Share of the word's distinct letters revealed as clues (see engine.clueCount). */
  clueRatio: number;
  /** Share of the letters NOT in the word taken off the keyboard (see engine.disabledCount). Shrinks to 0. */
  disabledRatio: number;
  maxWrong: number;
  /** Tokens a word won at this level pays before the streak bonus. Never shrinks as levels rise. */
  tokenReward: number;
  /** Long words with few clues: the player may buy LETTER_BUY_COUNT letters (config.ts) once per round. */
  sellsLetters: boolean;
}

export const LEVELS: readonly Level[] = [
  { level: 1, minLength: 3, maxLength: 5, clueRatio: 0.4, disabledRatio: 0.5, maxWrong: DEFAULT_MAX_WRONG, tokenReward: 1, sellsLetters: false },
  { level: 2, minLength: 4, maxLength: 6, clueRatio: 0.35, disabledRatio: 0.4, maxWrong: DEFAULT_MAX_WRONG, tokenReward: 1, sellsLetters: false },
  { level: 3, minLength: 5, maxLength: 7, clueRatio: 0.3, disabledRatio: 0.3, maxWrong: DEFAULT_MAX_WRONG, tokenReward: 2, sellsLetters: false },
  { level: 4, minLength: 6, maxLength: 8, clueRatio: 0.25, disabledRatio: 0.2, maxWrong: DEFAULT_MAX_WRONG, tokenReward: 2, sellsLetters: false },
  { level: 5, minLength: 7, maxLength: 9, clueRatio: 0.2, disabledRatio: 0.1, maxWrong: DEFAULT_MAX_WRONG, tokenReward: 3, sellsLetters: false },
  { level: 6, minLength: 8, maxLength: 11, clueRatio: 0.18, disabledRatio: 0, maxWrong: DEFAULT_MAX_WRONG, tokenReward: 3, sellsLetters: false },
  { level: 7, minLength: 9, maxLength: 13, clueRatio: 0.15, disabledRatio: 0, maxWrong: 8, tokenReward: 4, sellsLetters: false },
  { level: 8, minLength: 10, maxLength: 15, clueRatio: 0.12, disabledRatio: 0, maxWrong: 6, tokenReward: 4, sellsLetters: true },
];

/** The row for a level number (a round's snapshotted `level`), clamped to the table. */
export const levelByNumber = (level: number): Level => LEVELS[Math.min(LEVELS.length, Math.max(1, level)) - 1];

/** Where the player stands on the level ladder. Saved; every count restarts at 0 on a level change. */
export interface LevelProgress {
  level: number;
  /** Words guessed on this level: WORDS_PER_LEVEL of them move the player up. */
  wins: number;
  /** Rounds finished on this level: the first LEVEL_GRACE_ROUNDS never count toward a drop. */
  rounds: number;
  /** Rounds lost in a row after the grace: LOSSES_TO_DROP of them move the player down. */
  losses: number;
}

const onLevel = (level: number): LevelProgress => ({ level, wins: 0, rounds: 0, losses: 0 });

export const START_LEVEL: LevelProgress = onLevel(1);

/** A save from before levels could drop: the level came from the score, which only went up. */
export function levelFromScore(wordsGuessed: number): LevelProgress {
  const level = Math.min(LEVELS.length, 1 + Math.floor(wordsGuessed / WORDS_PER_LEVEL));
  const wins = wordsGuessed - (level - 1) * WORDS_PER_LEVEL;
  return { level, wins, rounds: wins, losses: 0 };
}

/**
 * The level after a finished round. A win clears the losses and may move the
 * player up; a loss after the grace counts toward a drop. Never below level 1
 * or above the last one.
 */
export function afterRound(p: LevelProgress, won: boolean): LevelProgress {
  const rounds = p.rounds + 1;
  if (won) {
    const wins = p.wins + 1;
    if (wins >= WORDS_PER_LEVEL && p.level < LEVELS.length) return onLevel(p.level + 1);
    return { ...p, wins, rounds, losses: 0 };
  }
  const losses = p.rounds >= LEVEL_GRACE_ROUNDS ? p.losses + 1 : 0;
  if (losses >= LOSSES_TO_DROP && p.level > 1) return onLevel(p.level - 1);
  return { ...p, rounds, losses };
}
