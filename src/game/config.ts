/*
 * Game tuning. Values marked PLACEHOLDER answer an open question in CLAUDE.md
 * that the owner has not decided yet. Change them here, and update
 * Context/game-rules.md when you do.
 */

/** The last balloon pops at this many wrong guesses (rule 7). */
export const DEFAULT_MAX_WRONG = 10;

/** The balloon animation has this many stages after the starting state (one balloon each). */
export const SCENE_STAGES = 10;

/** Word constraints (rule 2). */
export const MIN_WORD_LENGTH = 1;
export const MAX_WORD_LENGTH = 15;

/**
 * Long words always get at least LONG_WORD_CLUES clue letters, on every level
 * (owner's call, raised from 2 to 4 on 2026-10-22), and the first EDGE_CLUES of
 * them are the word's first or last letters (engine.edgeLetters): "RE…LE" is
 * what makes "reasonable" recognisable. PLACEHOLDER: the length that counts as
 * long (8 = the shortest words of level 6 and up).
 */
export const LONG_WORD_LENGTH = 8;
export const LONG_WORD_CLUES = 4;
export const EDGE_CLUES = 2;

/**
 * Harder words get more clue letters (owner's request): a word that costs a
 * typical player HARD_WORD_MISSES or more (WordEntry.difficulty) adds
 * HARD_WORD_CLUE_BONUS to the level's clueRatio (levels.clueRatioFor).
 * PLACEHOLDER: about one more letter.
 */
export const HARD_WORD_MISSES = 5;
export const HARD_WORD_CLUE_BONUS = 0.2;

/**
 * Each language's letters, most used first. On hard levels (Level.rareClues)
 * the clue letters are the word's rarest ones: the V of "virulent" is the
 * letter nobody tries, the E the one everybody does. A language without a row
 * gets random clues.
 */
export const LETTER_FREQUENCY: Readonly<Record<string, string>> = {
  en: 'etaoinshrdlucmfwypvbgkjqxz',
};

/**
 * A won word pays its level's tokenReward (levels.ts), plus +1 token for each
 * of these streak lengths reached (progress.tokenReward). A lost round resets
 * the streak. PLACEHOLDER: the steps, and so the bonus cap (+3).
 */
export const STREAK_BONUS_AT: readonly number[] = [3, 6, 10];

/** Unlocking a word's description costs 2 tokens. */
export const DESCRIPTION_COST = 2;

/** On levels with `sellsLetters` (levels.ts), the player can reveal 2 hidden letters for 10 tokens, once per round. */
export const LETTER_BUY_COUNT = 2;
export const LETTER_BUY_COST = 10;

/** The character a new player starts with. Always free. */
export const DEFAULT_CHARACTER = 'mochi';

/**
 * PLACEHOLDER: what each character costs in tokens (0 = free), cheapest
 * first: the Characters page lists them in this order. Every character in
 * design/characters/rig.js needs a row (a test checks it).
 *
 * Calibrated on a simulated player (Context/characters-shop.md): a
 * casual player nets ~1.35 tokens a round, a strong one ~2.1, after buying
 * some descriptions. So the first friend comes in the first session (~25
 * rounds), each next one takes longer, and the whole set takes a casual
 * player ~1100 rounds. Saving up for one favourite is never more than ~300.
 */
export const CHARACTER_PRICES: Readonly<Record<string, number>> = {
  mochi: 0,
  bun: 0,
  coco: 30,
  biscuit: 60,
  bao: 100,
  lolo: 150,
  ember: 200,
  rexy: 250,
  button: 300,
  ribbit: 400,
};

/** PLACEHOLDER: tokens a brand-new player starts with. */
export const STARTING_TOKENS = 3;

/** PLACEHOLDER: words guessed on a level that move the player up one. */
export const WORDS_PER_LEVEL = 10;

/** PLACEHOLDER: rounds lost in a row that move the player down one level (never below level 1). */
export const LOSSES_TO_DROP = 3;

/** PLACEHOLDER: the first rounds on a new level never count toward a drop. */
export const LEVEL_GRACE_ROUNDS = 3;

/** The MVP is English only (stored with every word from day one). */
export const DEFAULT_LANGUAGE = 'en';
