/*
 * Game tuning. Values marked PLACEHOLDER answer an open question in CLAUDE.md
 * that the owner has not decided yet. Change them here, and update
 * Context/game-rules.md when you do.
 */

/** The character is fully hanged at this many wrong guesses (rule 7). */
export const DEFAULT_MAX_WRONG = 10;

/** The hanging animation has this many stages after the starting state. */
export const HANGING_STAGES = 10;

/** Word constraints (rule 2). */
export const MIN_WORD_LENGTH = 1;
export const MAX_WORD_LENGTH = 15;

/** 1 token for every word guessed. At 1 the "Next token" bar is hidden (it would always read 0 / 1). */
export const WORDS_PER_TOKEN = 1;

/** Unlocking a word's description costs 1 token. */
export const DESCRIPTION_COST = 1;

/** PLACEHOLDER: tokens a brand-new player starts with. */
export const STARTING_TOKENS = 3;

/** PLACEHOLDER: words guessed per level-up (the player can never drop back down). */
export const WORDS_PER_LEVEL = 10;

/** Solo mode never repeats any of the last N words. */
export const RECENT_WORDS_MEMORY = 40;

/** The MVP is English only (stored with every word from day one). */
export const DEFAULT_LANGUAGE = 'en';
