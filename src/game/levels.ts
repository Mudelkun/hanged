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
  LEVEL_GRACE_ROUNDS,
  LOSSES_TO_DROP,
  WORDS_PER_LEVEL,
} from './config';

export interface Level {
  level: number;
  /** Inclusive word-length range for solo words at this level. */
  minLength: number;
  maxLength: number;
  /** Deal only things you can picture (WordEntry.concrete): "badly" or "adhere" are common but hard to guess. */
  concreteOnly: boolean;
  /**
   * The rarest words dealt (WordEntry.rarity): 20 = everyday words, on levels
   * 1–15 (owner's call); 35, then 40, bring in less familiar words on 16–20.
   */
  maxRarity: number;
  /** The hardest words dealt by WordEntry.difficulty (misses a typical player makes on it, no clues): keeps "magnesium" off easy levels. */
  maxDifficulty: number;
  /**
   * Distinct letters the player has to find: the rest are clues
   * (engine.clueCount), the rarest letters first (engine.pickClueLetters).
   * The main difficulty knob, never lower than the level before. A fraction
   * is a chance: 4.3 = 5 letters in 30% of rounds, else 4.
   */
  toFind: number;
  /** The word's subject is shown for free (Round.subject). Owner's call: from level 9. */
  showsSubject: boolean;
  /** Share of the letters NOT in the word taken off the keyboard (see engine.disabledCount). Only levels 1–2: a full keyboard after that. */
  disabledRatio: number;
  maxWrong: number;
  /** Tokens a word won at this level pays before the streak bonus. Never shrinks as levels rise. */
  tokenReward: number;
  /** The player may buy LETTER_BUY_COUNT letters (config.ts) once per round, on the hard levels. */
  sellsLetters: boolean;
}

const W = DEFAULT_MAX_WRONG;

export const LEVELS: readonly Level[] = [
  // 1–15: everyday words only (maxRarity 20), the letters to find growing slowly. Only things to picture up to 4,
  // wrong keys off the keyboard on 1–2. 16–20: less familiar words come in (rarity 35, then 40), a few more each level.
  { level: 1, minLength: 3, maxLength: 5, concreteOnly: true, maxRarity: 20, maxDifficulty: 4, toFind: 2, showsSubject: false, disabledRatio: 0.3, maxWrong: W, tokenReward: 1, sellsLetters: false },
  { level: 2, minLength: 4, maxLength: 6, concreteOnly: true, maxRarity: 20, maxDifficulty: 5, toFind: 3, showsSubject: false, disabledRatio: 0.15, maxWrong: W, tokenReward: 1, sellsLetters: false },
  { level: 3, minLength: 5, maxLength: 7, concreteOnly: true, maxRarity: 20, maxDifficulty: 6, toFind: 4, showsSubject: false, disabledRatio: 0, maxWrong: W, tokenReward: 2, sellsLetters: false },
  { level: 4, minLength: 5, maxLength: 8, concreteOnly: true, maxRarity: 20, maxDifficulty: 6, toFind: 4, showsSubject: false, disabledRatio: 0, maxWrong: W, tokenReward: 2, sellsLetters: false },
  { level: 5, minLength: 6, maxLength: 9, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4, showsSubject: false, disabledRatio: 0, maxWrong: W, tokenReward: 3, sellsLetters: false },
  { level: 6, minLength: 6, maxLength: 11, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.2, showsSubject: false, disabledRatio: 0, maxWrong: W, tokenReward: 3, sellsLetters: false },
  { level: 7, minLength: 6, maxLength: 13, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.3, showsSubject: false, disabledRatio: 0, maxWrong: W, tokenReward: 4, sellsLetters: false },
  { level: 8, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.4, showsSubject: false, disabledRatio: 0, maxWrong: W, tokenReward: 4, sellsLetters: true },
  { level: 9, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.4, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 4, sellsLetters: true },
  { level: 10, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.5, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 4, sellsLetters: true },
  { level: 11, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.5, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 4, sellsLetters: true },
  { level: 12, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.6, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 13, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.6, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 14, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.6, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 15, minLength: 6, maxLength: 15, concreteOnly: false, maxRarity: 20, maxDifficulty: 8, toFind: 4.7, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 16, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 35, maxDifficulty: 8, toFind: 5, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 17, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 35, maxDifficulty: 11, toFind: 5.3, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 18, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 35, maxDifficulty: 14, toFind: 5.6, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 19, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 35, maxDifficulty: 18, toFind: 5.9, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
  { level: 20, minLength: 5, maxLength: 15, concreteOnly: false, maxRarity: 40, maxDifficulty: 22, toFind: 6.2, showsSubject: true, disabledRatio: 0, maxWrong: W, tokenReward: 5, sellsLetters: true },
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

/** Words still to guess before the level moves up, or null on the last level (it never moves up). */
export const wordsToNextLevel = (p: LevelProgress): number | null =>
  p.level >= LEVELS.length ? null : Math.max(1, WORDS_PER_LEVEL - p.wins);

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
