/*
 * Progressive difficulty. The player never picks a level: words guessed move
 * it up, and rounds lost in a row move it back down (`afterRound`).
 *
 * PLACEHOLDER: the owner has not decided the clue formula, the number of
 * levels or how many wins move a player up (see "Open questions" in CLAUDE.md).
 * Everything that drives difficulty lives in this one table.
 */
import {
  DEFAULT_MAX_WRONG,
  HARD_WORD_CLUE_BONUS,
  HARD_WORD_MISSES,
  LEVEL_GRACE_ROUNDS,
  LOSSES_TO_DROP,
  WORDS_PER_LEVEL,
} from './config';
import type { WordEntry } from './words';

export interface Level {
  level: number;
  /** Inclusive word-length range for solo words at this level. */
  minLength: number;
  maxLength: number;
  /** Deal only things you can picture (WordEntry.concrete): "badly" or "adhere" are common but hard to guess. */
  concreteOnly: boolean;
  /** The rarest words dealt (WordEntry.rarity): 10 = words everyone knows, up to 50 on the hardest levels. */
  maxRarity: number;
  /**
   * The band of words dealt by WordEntry.difficulty (misses a typical player
   * makes on it, no clues). Easy levels keep "magnesium" (13 misses) out; from
   * level 9 the band climbs, so the hardest words wait for the highest levels,
   * where the help is (rareClues, showsSubject, sellsLetters).
   */
  minDifficulty: number;
  maxDifficulty: number;
  /** Share of the word's distinct letters revealed as clues (see engine.clueCount); harder words get more (clueRatioFor). */
  clueRatio: number;
  /**
   * How many of the clue letters are the word's rarest, after a long word's
   * first or last letters and before the random ones (engine.pickClueLetters):
   * the V of "virulent", not its E. The strongest help there is, so it grows
   * slowly on the hard levels.
   */
  rareClues: number;
  /** The word's subject is shown for free (Round.subject). Owner's call: from level 9. */
  showsSubject: boolean;
  /** Share of the letters NOT in the word taken off the keyboard (see engine.disabledCount). Shrinks to 0. */
  disabledRatio: number;
  maxWrong: number;
  /** Tokens a word won at this level pays before the streak bonus. Never shrinks as levels rise. */
  tokenReward: number;
  /** The player may buy LETTER_BUY_COUNT letters (config.ts) once per round, on the hard levels. */
  sellsLetters: boolean;
}

const W = DEFAULT_MAX_WRONG;

export const LEVELS: readonly Level[] = [
  // 1–8: words most players can guess. Only things to picture up to 4, then every kind of word.
  { level: 1, minLength: 3, maxLength: 5, concreteOnly: true, maxRarity: 20, minDifficulty: 0, maxDifficulty: 4, clueRatio: 0.4, rareClues: 0, showsSubject: false, disabledRatio: 0.5, maxWrong: W, tokenReward: 1, sellsLetters: false },
  { level: 2, minLength: 4, maxLength: 6, concreteOnly: true, maxRarity: 20, minDifficulty: 0, maxDifficulty: 5, clueRatio: 0.35, rareClues: 0, showsSubject: false, disabledRatio: 0.45, maxWrong: W, tokenReward: 1, sellsLetters: false },
  { level: 3, minLength: 5, maxLength: 7, concreteOnly: true, maxRarity: 35, minDifficulty: 0, maxDifficulty: 5, clueRatio: 0.3, rareClues: 0, showsSubject: false, disabledRatio: 0.4, maxWrong: W, tokenReward: 2, sellsLetters: false },
  { level: 4, minLength: 6, maxLength: 8, concreteOnly: true, maxRarity: 35, minDifficulty: 0, maxDifficulty: 6, clueRatio: 0.25, rareClues: 0, showsSubject: false, disabledRatio: 0.4, maxWrong: W, tokenReward: 2, sellsLetters: false },
  { level: 5, minLength: 7, maxLength: 9, concreteOnly: false, maxRarity: 35, minDifficulty: 0, maxDifficulty: 6, clueRatio: 0.2, rareClues: 0, showsSubject: false, disabledRatio: 0.35, maxWrong: W, tokenReward: 3, sellsLetters: false },
  { level: 6, minLength: 8, maxLength: 11, concreteOnly: false, maxRarity: 35, minDifficulty: 0, maxDifficulty: 7, clueRatio: 0.18, rareClues: 0, showsSubject: false, disabledRatio: 0.35, maxWrong: W, tokenReward: 3, sellsLetters: false },
  { level: 7, minLength: 9, maxLength: 13, concreteOnly: false, maxRarity: 35, minDifficulty: 0, maxDifficulty: 7, clueRatio: 0.15, rareClues: 0, showsSubject: false, disabledRatio: 0.3, maxWrong: W, tokenReward: 4, sellsLetters: false },
  { level: 8, minLength: 10, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 0, maxDifficulty: 8, clueRatio: 0.12, rareClues: 0, showsSubject: false, disabledRatio: 0.3, maxWrong: W, tokenReward: 4, sellsLetters: true },
  // 9–20: harder and harder words (the band climbs) with more help: the subject, letters to buy, and the
  // rarest letters as clues (1 from level 11, 2 from 13). clueRatio 0 = the fewest clues plus the hard-word bonus.
  { level: 9, minLength: 8, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 8, maxDifficulty: 11, clueRatio: 0, rareClues: 0, showsSubject: true, disabledRatio: 0.25, maxWrong: W, tokenReward: 4, sellsLetters: true },
  { level: 10, minLength: 8, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 9, maxDifficulty: 12, clueRatio: 0, rareClues: 0, showsSubject: true, disabledRatio: 0.25, maxWrong: W, tokenReward: 4, sellsLetters: true },
  { level: 11, minLength: 7, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 10, maxDifficulty: 13, clueRatio: 0, rareClues: 1, showsSubject: true, disabledRatio: 0.2, maxWrong: W, tokenReward: 4, sellsLetters: true },
  { level: 12, minLength: 7, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 11, maxDifficulty: 14, clueRatio: 0, rareClues: 1, showsSubject: true, disabledRatio: 0.2, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 13, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 12, maxDifficulty: 15, clueRatio: 0, rareClues: 2, showsSubject: true, disabledRatio: 0.15, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 14, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 13, maxDifficulty: 16, clueRatio: 0, rareClues: 2, showsSubject: true, disabledRatio: 0.15, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 15, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 14, maxDifficulty: 17, clueRatio: 0, rareClues: 2, showsSubject: true, disabledRatio: 0.15, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 16, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 35, minDifficulty: 15, maxDifficulty: 18, clueRatio: 0, rareClues: 2, showsSubject: true, disabledRatio: 0.05, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 17, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 50, minDifficulty: 16, maxDifficulty: 19, clueRatio: 0, rareClues: 2, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 18, minLength: 4, maxLength: 15, concreteOnly: false, maxRarity: 50, minDifficulty: 17, maxDifficulty: 20, clueRatio: 0, rareClues: 2, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 19, minLength: 4, maxLength: 15, concreteOnly: false, maxRarity: 50, minDifficulty: 18, maxDifficulty: 22, clueRatio: 0, rareClues: 2, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 20, minLength: 4, maxLength: 15, concreteOnly: false, maxRarity: 50, minDifficulty: 19, maxDifficulty: 25, clueRatio: 0.05, rareClues: 2, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
];

/** The row for a level number (a round's snapshotted `level`), clamped to the table. */
export const levelByNumber = (level: number): Level => LEVELS[Math.min(LEVELS.length, Math.max(1, level)) - 1];

/**
 * The share of `word`'s letters revealed as clues on `level`: the level's
 * clueRatio, plus a bonus for a word that measures hard to guess, so
 * "virulent" stays as fair as "giraffe".
 */
export const clueRatioFor = (level: Level, word: Pick<WordEntry, 'difficulty'>): number =>
  level.clueRatio + (word.difficulty >= HARD_WORD_MISSES ? HARD_WORD_CLUE_BONUS : 0);

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
