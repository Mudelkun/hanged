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
 * Long words always get at least 2 clue letters, even on the hardest levels
 * (owner's call), so they stay challenging but fair. PLACEHOLDER: the length
 * that counts as long (8 = the shortest words of level 6 and up).
 */
export const LONG_WORD_LENGTH = 8;
export const LONG_WORD_CLUES = 2;

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
