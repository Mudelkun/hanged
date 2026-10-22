/*
 * The round rules from CLAUDE.md, as pure functions with no React and no
 * storage. A round is plain serializable data; everything else (revealed
 * letters, wrong count, status, scene stage) is derived from it, so the
 * derived values can never fall out of sync with what was guessed.
 *
 * Letters are lowercase a–z internally (like the original "Pendu");
 * the UI uppercases them for display.
 */
import {
  DEFAULT_MAX_WRONG,
  EDGE_CLUES,
  SCENE_STAGES,
  LETTER_FREQUENCY,
  LONG_WORD_LENGTH,
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
} from './config';

export type Letter = string; // one of a–z

export const ALPHABET: readonly Letter[] = 'abcdefghijklmnopqrstuvwxyz'.split('');

export interface Round {
  id: string;
  wordId: string;
  word: string;
  language: string;
  description: string;
  /**
   * The word's subject key (translated as subjects.<key>), shown for free on
   * levels that show it (Level.showsSubject). Absent elsewhere, and in rounds
   * saved before subjects existed.
   */
  subject?: string;
  level: number;
  maxWrong: number;
  /** Letters revealed when the round starts. Their keys count as used. */
  clueLetters: Letter[];
  /** Letters not in the word, taken off the keyboard at the start (easy levels). Their keys count as used. */
  disabledLetters: Letter[];
  /** Letters the player bought with tokens (hardest levels). They look and count like clues. */
  boughtLetters: Letter[];
  /** Letters the player picked, in order. Never contains a clue letter or a repeat. */
  guessed: Letter[];
  /** The player revealed the free description; kept across app restarts. */
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

/** The fewest clues a word gets on any level: a long word shows its edge (EDGE_CLUES letters). */
export const minClues = (word: string) => (word.length >= LONG_WORD_LENGTH ? EDGE_CLUES : 1);

/**
 * How many distinct letters to reveal at the start: all but `toFind` (the
 * level's letters to find), so a longer word gets more clues and the player
 * always has the same work to do. Every word gets at least one clue (a long
 * word its edge), so a word with few letters leaves fewer to find, and at
 * least one letter always stays hidden. When those collide (a word with a
 * single distinct letter, e.g. "a" or "aaa"), keeping a letter hidden wins
 * and the word gets no clue.
 */
export function clueCount(word: string, toFind: number): number {
  const distinct = uniqueLetters(word).length;
  if (distinct < 2) return 0;
  return Math.min(distinct - 1, Math.max(minClues(word), distinct - toFind));
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

/**
 * A long word's first or last EDGE_CLUES letters, front or back at random
 * (owner's call): a word's start or ending is what people recognise it by.
 * Short words get none.
 */
export function edgeLetters(word: string, rng: () => number = Math.random): Letter[] {
  if (word.length < LONG_WORD_LENGTH) return [];
  return uniqueLetters(rng() < 0.5 ? word.slice(0, EDGE_CLUES) : word.slice(-EDGE_CLUES));
}

/**
 * The clue letters, in this order until there are clueCount of them: a long
 * word's edge (edgeLetters), so the player can recognise it, then its rarest
 * letters by `frequency` (a language's letters, most used first): the ones
 * that cost players the most misses. What's left to find is what a player can
 * find. Equally rare letters, and every letter of a language without a
 * `frequency`, come in random order.
 */
export function pickClueLetters(word: string, toFind: number, rng: () => number = Math.random, frequency?: string): Letter[] {
  const edge = edgeLetters(word, rng);
  const letters = shuffled(uniqueLetters(word), rng).filter((c) => !edge.includes(c));
  if (frequency) {
    const rank = (c: Letter) => (frequency.includes(c) ? frequency.indexOf(c) : frequency.length);
    letters.sort((a, b) => rank(b) - rank(a));
  }
  return [...edge, ...letters].slice(0, clueCount(word, toFind));
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
  /** Shown for free: only on levels that show the subject. */
  subject?: string;
  level: number;
  /** Distinct letters left to find (Level.toFind). A fraction is a chance: 4.3 = 5 letters in 30% of rounds, else 4. */
  toFind: number;
  /** Share of the decoy letters disabled on the keyboard (0 = full keyboard). */
  disabledRatio?: number;
  maxWrong?: number;
}

export function createRound(input: NewRoundInput, rng: () => number = Math.random): Round {
  const checked = validateWord(input.word);
  if (!checked.ok) throw new Error(`Invalid word "${input.word}": ${checked.error}`);
  const toFind = Math.floor(input.toFind + rng());
  return {
    id: input.id,
    wordId: input.wordId,
    word: checked.word,
    language: input.language,
    description: input.description,
    ...(input.subject && { subject: input.subject }),
    level: input.level,
    maxWrong: input.maxWrong ?? DEFAULT_MAX_WRONG,
    clueLetters: pickClueLetters(checked.word, toFind, rng, LETTER_FREQUENCY[input.language]),
    disabledLetters: pickDisabledLetters(checked.word, input.disabledRatio ?? 0, rng),
    boughtLetters: [],
    guessed: [],
    descriptionUnlocked: false,
  };
}

/** Every letter that is out of play: clues + disabled keys + bought letters + guesses. */
export const usedLetters = (r: Round): Set<Letter> =>
  new Set([...r.clueLetters, ...r.disabledLetters, ...r.boughtLetters, ...r.guessed]);

/** A letter shown for free at the start or bought: both look like clues. */
const isClue = (r: Round, c: Letter) => r.clueLetters.includes(c) || r.boughtLetters.includes(c);

/** The word's distinct letters that are still hidden. */
export const hiddenLetters = (r: Round): Letter[] => {
  const used = usedLetters(r);
  return uniqueLetters(r.word).filter((c) => !used.has(c));
};

export const wrongLetters = (r: Round): Letter[] => r.guessed.filter((c) => !r.word.includes(c));

export const wrongCount = (r: Round) => wrongLetters(r).length;

export function roundStatus(r: Round): RoundStatus {
  const used = usedLetters(r);
  if (r.word.split('').every((c) => used.has(c))) return 'won';
  if (wrongCount(r) >= r.maxWrong) return 'lost';
  return 'playing';
}

/**
 * The balloon stage to show (0 = all 10 balloons, 10 = the last one popped). With fewer allowed
 * wrong guesses the count is scaled, so the last miss always lands on 10.
 */
export const sceneStage = (r: Round) =>
  Math.min(SCENE_STAGES, Math.round((wrongCount(r) * SCENE_STAGES) / r.maxWrong));

/**
 * Balloons gone from the full bunch of 10. A round starts with one balloon
 * per allowed miss (the 10 − maxWrong others are never there), and every
 * wrong guess pops exactly one, so the balloons left always match the misses left.
 */
export const balloonsGone = (r: Round) =>
  Math.max(0, Math.min(SCENE_STAGES, SCENE_STAGES - r.maxWrong + wrongCount(r)));

/** Balloons still up: the same as the misses the player has left. */
export const balloonsLeft = (r: Round) => SCENE_STAGES - balloonsGone(r);

export function keyState(r: Round, c: Letter): KeyState {
  if (isClue(r, c)) return 'clue';
  if (r.disabledLetters.includes(c)) return 'off';
  if (!r.guessed.includes(c)) return 'idle';
  return r.word.includes(c) ? 'ok' : 'no';
}

export function tileState(r: Round, c: Letter): TileState {
  if (isClue(r, c)) return 'clue';
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

// ---- bought letters (hardest levels) ----

/**
 * `count` letters can be bought once per round, while it's playing, and only
 * if at least one letter stays hidden after (rule 4), so buying never wins
 * the round and the player always gets the full `count` they paid for.
 */
export const canBuyLetters = (r: Round, count: number) =>
  r.boughtLetters.length === 0 && roundStatus(r) === 'playing' && hiddenLetters(r).length > count;

/** Reveals `count` random hidden letters (every occurrence). Returns the same object when not allowed. */
export function buyLetters(r: Round, count: number, rng: () => number = Math.random): Round {
  if (!canBuyLetters(r, count)) return r;
  return { ...r, boughtLetters: shuffled(hiddenLetters(r), rng).slice(0, count) };
}
