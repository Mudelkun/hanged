/*
 * The word database. For now it is a JSON file bundled with the app
 * (data/words.json); it will move to PostgreSQL. Keep every read behind
 * this module so that move only touches this file.
 */
import rawWords from '../../data/words.json';
import type { Level } from './levels';

export interface WordEntry {
  id: string;
  word: string;
  language: string;
  /** A dictionary definition (Open English WordNet, see data/CREDITS.md), never hand-written. */
  description: string;
  /** The WordNet sense the description comes from, e.g. "oewn-02124272-n". */
  sense: string;
  /** 2–4 one-word hints, free to show (checked by scripts/check-words.js). */
  hints: string[];
}

export const WORDS: readonly WordEntry[] = rawWords as WordEntry[];

const BY_ID = new Map(WORDS.map((w) => [w.id, w]));

export const wordById = (id: string): WordEntry | undefined => BY_ID.get(id);

const POOLS = new Map<string, readonly WordEntry[]>();

/**
 * The words a level deals: those in its length range, or the closest lengths
 * if none fit. Cached for the bundled database.
 */
export function levelPool(level: Level, language: string, words: readonly WordEntry[] = WORDS): readonly WordEntry[] {
  const key = `${language}:${level.minLength}-${level.maxLength}`;
  const cached = words === WORDS && POOLS.get(key);
  if (cached) return cached;
  const inLanguage = words.filter((w) => w.language === language);
  if (inLanguage.length === 0) throw new Error(`No words for language "${language}"`);
  const gap = (w: WordEntry) => Math.max(0, level.minLength - w.word.length, w.word.length - level.maxLength);
  const best = Math.min(...inLanguage.map(gap));
  const pool = inLanguage.filter((w) => gap(w) === best);
  if (words === WORDS) POOLS.set(key, pool);
  return pool;
}

/**
 * A random word the player hasn't seen yet. Once every word of the level has
 * been dealt, the level starts over (seenWord then forgets its words), except
 * the word just played, so a word never comes twice in a row.
 * `seenIds` is oldest first, so its last id is the word just played.
 */
export function pickWord(
  level: Level,
  language: string,
  seenIds: readonly string[],
  rng: () => number = Math.random,
  words: readonly WordEntry[] = WORDS,
): WordEntry {
  const pool = levelPool(level, language, words);
  const seen = new Set(seenIds);
  const pick = (list: readonly WordEntry[]) => list[Math.floor(rng() * list.length)];
  const fresh = pool.filter((w) => !seen.has(w.id));
  if (fresh.length) return pick(fresh);
  const last = seenIds[seenIds.length - 1];
  const again = pool.filter((w) => w.id !== last);
  return pick(again.length ? again : pool);
}

/**
 * The seen list once `word` is dealt. pickWord only deals a seen word when the
 * level ran out, so that starts the level over: its other words become new again.
 */
export function seenWord(
  seenIds: readonly string[],
  word: WordEntry,
  level: Level,
  words: readonly WordEntry[] = WORDS,
): string[] {
  if (!seenIds.includes(word.id)) return [...seenIds, word.id];
  const restart = new Set(levelPool(level, word.language, words).map((w) => w.id));
  return [...seenIds.filter((id) => !restart.has(id)), word.id];
}
