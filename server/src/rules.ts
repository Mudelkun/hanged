/*
 * The round constants the engine (engine.ts) needs, shared by the app and the
 * server like contract.ts: the server deals Versus rounds with the same
 * engine, so both must agree. No imports. The app reads them through
 * src/game/config.ts, which re-exports them with the rest of the tuning.
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
