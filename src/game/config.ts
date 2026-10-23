/*
 * Game tuning. Values marked PLACEHOLDER answer an open question in CLAUDE.md
 * that the owner has not decided yet. Change them here, and update
 * the relevant Context file when you do.
 */

/** The last balloon pops at this many wrong guesses (rule 7). */
export const DEFAULT_MAX_WRONG = 10;

/** The balloon animation has this many stages after the starting state (one balloon each). */
export const SCENE_STAGES = 10;

/** Word constraints (rule 2). */
export const MIN_WORD_LENGTH = 1;
export const MAX_WORD_LENGTH = 15;

/**
 * A long word's clues always start with its first or last EDGE_CLUES letters
 * (engine.edgeLetters): "RE…LE" is what makes "reasonable" recognisable.
 * How many clues it gets is the level's `toFind` (levels.ts): a long word on
 * levels 3+ always leaves at least 3 letters to find (owner's call,
 * 2026-10-22: 2 letters to find in a 12-letter word is no game).
 * PLACEHOLDER: the length that counts as long.
 */
export const LONG_WORD_LENGTH = 8;
export const EDGE_CLUES = 2;

/**
 * Each language's letters, most used first. After a long word's edge, the
 * clue letters are the word's rarest ones (engine.pickClueLetters): the V of
 * "virulent" is the letter nobody tries, the E the one everybody does, so the
 * letters left to find are the ones a player can find. A language without a
 * row gets random clues.
 */
export const LETTER_FREQUENCY: Readonly<Record<string, string>> = {
  en: 'etaoinshrdlucmfwypvbgkjqxz',
  fr: 'esaitnrulodcmpvqfbghjxzwykœ',
  es: 'eaosrnidlctumpbgvyqhfzjñxkw',
  de: 'enisratdhulcgmobwfkzpvßjyxq',
};

/**
 * A won word pays its level's tokenReward (levels.ts), plus +1 token for each
 * of these streak lengths reached (progress.tokenReward). A lost round resets
 * the streak. PLACEHOLDER: the steps, and so the bonus cap (+3).
 */
export const STREAK_BONUS_AT: readonly number[] = [3, 6, 10];

/** On levels with `sellsLetters` (levels.ts), reveal 2 hidden letters for 15 tokens, once per round. */
export const LETTER_BUY_COUNT = 2;
export const LETTER_BUY_COST = 15;

/** The character a new player starts with. Always free. */
export const DEFAULT_CHARACTER = 'mochi';

/**
 * PLACEHOLDER: what each character costs in tokens (0 = free), cheapest
 * first: the Characters page lists them in this order. Every character in
 * design/characters/rig.js needs a row (a test checks it).
 *
 * Steady pace chosen by the owner (2026-10-22), with free descriptions:
 * first paid character in ~20-30 rounds; full collection in ~1,500-2,000
 * for a regular player. Run npm run check:economy for the outcome model,
 * its assumptions and spending sensitivity (Context/characters-shop.md).
 * Early unlocks stay accessible; later ones account for higher level rewards.
 */
export const CHARACTER_PRICES: Readonly<Record<string, number>> = {
  mochi: 0,
  bun: 0,
  coco: 0,
  biscuit: 50,
  pip: 150,
  bao: 200,
  koa: 250,
  lolo: 300,
  rocco: 375,
  ember: 450,
  sage: 550,
  rexy: 650,
  vesper: 800,
  button: 950,
  ribbit: 1100,
};

/** PLACEHOLDER: tokens a brand-new player starts with. */
export const STARTING_TOKENS = 3;

/** PLACEHOLDER: words guessed on a level that move the player up one. */
export const WORDS_PER_LEVEL = 10;

/** PLACEHOLDER: rounds lost in a row that move the player down one level (never below level 1). */
export const LOSSES_TO_DROP = 3;

/** PLACEHOLDER: the first rounds on a new level never count toward a drop. */
export const LEVEL_GRACE_ROUNDS = 3;

/** Fallback when none of the device's preferred languages is supported. */
export const DEFAULT_LANGUAGE = 'en';
