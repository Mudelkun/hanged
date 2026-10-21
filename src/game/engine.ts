/*
 * The round rules from CLAUDE.md, as pure functions with no React and no
 * storage. A round is plain serializable data; everything else (revealed
 * letters, wrong count, status, hanging stage) is derived from it, so the
 * derived values can never fall out of sync with what was guessed.
 *
 * Letters are lowercase a–z internally (like the original "Pendu");
 * the UI uppercases them for display.
 */
import { DEFAULT_MAX_WRONG, HANGING_STAGES, MAX_WORD_LENGTH, MIN_WORD_LENGTH } from './config';

export type Letter = string; // one of a–z

export const ALPHABET: readonly Letter[] = 'abcdefghijklmnopqrstuvwxyz'.split('');

export interface Round {
  id: string;
  wordId: string;
  word: string;
  language: string;
  description: string;
  /** One-word hints the player can show for free and loop through (UI only, never a rule). */
  hints: string[];
  level: number;
  maxWrong: number;
  /** Letters revealed when the round starts. Their keys count as used. */
  clueLetters: Letter[];
  /** Letters not in the word, taken off the keyboard at the start (easy levels). Their keys count as used. */
  disabledLetters: Letter[];
  /** Letters the player picked, in order. Never contains a clue letter or a repeat. */
  guessed: Letter[];
  descriptionUnlocked: boolean;
}

export type RoundStatus = 'playing' | 'won' | 'lost';
export type KeyState = 'idle' | 'clue' | 'ok' | 'no' | 'off';
export type TileState = 'hidden' | 'clue' | 'ok';

// ---- word constraints (rule 2) ----

export type WordError = 'empty' | 'too_long' | 'not_letters';

/** Lowercases a word. It never strips or swaps characters: an invalid word stays invalid. */
export const normalizeWord = (raw: string) => raw.trim().toLowerCase();

/**
 * Letters only (plain A–Z, no accents, spaces, digits or hyphens), 1 to 15
 * letters inclusive. The C# original rejected 15-letter words (`< 15`) and
 * accepted accented letters (`char.IsLetter`); both are bugs, not rules.
 */
export function validateWord(raw: string): { ok: true; word: string } | { ok: false; error: WordError } {
  const word = normalizeWord(raw);
  if (word.length < MIN_WORD_LENGTH) return { ok: false, error: 'empty' };
  if (!/^[a-z]+$/.test(word)) return { ok: false, error: 'not_letters' };
  if (word.length > MAX_WORD_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, word };
}

export const isLetter = (c: string): c is Letter => /^[a-z]$/.test(c);

export const uniqueLetters = (word: string): Letter[] => [...new Set(word.split(''))];

// ---- clues (rule 4) ----

/**
 * How many distinct letters to reveal at the start.
 * Every word gets at least one clue, longer words get more (`ratio` comes
 * from the level), and at least one letter always stays hidden. When those
 * collide (a word with a single distinct letter, e.g. "a" or "aaa"), keeping
 * a letter hidden wins and the word gets no clue.
 */
export function clueCount(word: string, ratio: number): number {
  const distinct = uniqueLetters(word).length;
  if (distinct < 2) return 0;
  return Math.min(distinct - 1, Math.max(1, Math.round(distinct * ratio)));
}

/** Fisher–Yates shuffle of a fresh copy. */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function pickClueLetters(word: string, ratio: number, rng: () => number = Math.random): Letter[] {
  return shuffled(uniqueLetters(word), rng).slice(0, clueCount(word, ratio));
}

// ---- disabled keys (easy levels) ----

/** Letters of the alphabet that are not in the word: the only ones a level may disable. */
export const decoyLetters = (word: string): Letter[] => ALPHABET.filter((c) => !word.includes(c));

/**
 * How many decoy letters to take off the keyboard (`ratio` comes from the
 * level and shrinks as levels rise). At least one decoy always stays, so a
 * wrong guess is still possible.
 */
export function disabledCount(word: string, ratio: number): number {
  const decoys = decoyLetters(word).length;
  return Math.max(0, Math.min(decoys - 1, Math.round(decoys * ratio)));
}

export function pickDisabledLetters(word: string, ratio: number, rng: () => number = Math.random): Letter[] {
  const count = disabledCount(word, ratio);
  return count ? shuffled(decoyLetters(word), rng).slice(0, count) : [];
}

// ---- rounds ----

export interface NewRoundInput {
  id: string;
  wordId: string;
  word: string;
  language: string;
  description: string;
  hints: readonly string[];
  level: number;
  clueRatio: number;
  /** Share of the decoy letters disabled on the keyboard (0 = full keyboard). */
  disabledRatio?: number;
  maxWrong?: number;
}

export function createRound(input: NewRoundInput, rng: () => number = Math.random): Round {
  const checked = validateWord(input.word);
  if (!checked.ok) throw new Error(`Invalid word "${input.word}": ${checked.error}`);
  return {
    id: input.id,
    wordId: input.wordId,
    word: checked.word,
    language: input.language,
    description: input.description,
    hints: [...input.hints],
    level: input.level,
    maxWrong: input.maxWrong ?? DEFAULT_MAX_WRONG,
    clueLetters: pickClueLetters(checked.word, input.clueRatio, rng),
    disabledLetters: pickDisabledLetters(checked.word, input.disabledRatio ?? 0, rng),
    guessed: [],
    descriptionUnlocked: false,
  };
}

/** Every letter that is out of play: clues + disabled keys + guesses. */
export const usedLetters = (r: Round): Set<Letter> => new Set([...r.clueLetters, ...r.disabledLetters, ...r.guessed]);

export const wrongLetters = (r: Round): Letter[] => r.guessed.filter((c) => !r.word.includes(c));

export const wrongCount = (r: Round) => wrongLetters(r).length;

export function roundStatus(r: Round): RoundStatus {
  const used = usedLetters(r);
  if (r.word.split('').every((c) => used.has(c))) return 'won';
  if (wrongCount(r) >= r.maxWrong) return 'lost';
  return 'playing';
}

/**
 * The hanging stage to show (0 = start, 10 = hanged). With fewer allowed
 * wrong guesses the count is scaled, so the last miss always lands on 10.
 */
export const hangingStage = (r: Round) =>
  Math.min(HANGING_STAGES, Math.round((wrongCount(r) * HANGING_STAGES) / r.maxWrong));

export function keyState(r: Round, c: Letter): KeyState {
  if (r.clueLetters.includes(c)) return 'clue';
  if (r.disabledLetters.includes(c)) return 'off';
  if (!r.guessed.includes(c)) return 'idle';
  return r.word.includes(c) ? 'ok' : 'no';
}

export function tileState(r: Round, c: Letter): TileState {
  if (r.clueLetters.includes(c)) return 'clue';
  return r.guessed.includes(c) ? 'ok' : 'hidden';
}

/**
 * One turn (rule 5). Returns the same object when the guess is not allowed:
 * the round is over (rule 9), the letter was already tried or given as a clue
 * (rule 6), its key was disabled at the start, or it is not a–z.
 */
export function guess(r: Round, raw: string): Round {
  const c = raw.toLowerCase();
  if (!isLetter(c)) return r;
  if (roundStatus(r) !== 'playing') return r;
  if (usedLetters(r).has(c)) return r;
  return { ...r, guessed: [...r.guessed, c] };
}

export const unlockDescription = (r: Round): Round =>
  r.descriptionUnlocked ? r : { ...r, descriptionUnlocked: true };
