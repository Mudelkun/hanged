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
  description: string;
  /** 2–4 one-word hints, free to show (checked by scripts/check-words.js). */
  hints: string[];
}

export const WORDS: readonly WordEntry[] = rawWords as WordEntry[];

const BY_ID = new Map(WORDS.map((w) => [w.id, w]));

export const wordById = (id: string): WordEntry | undefined => BY_ID.get(id);

/**
 * A random word for the level, avoiding the recently played ones. If the
 * filters leave nothing, it relaxes them in order: recent words first, then
 * the length range (closest lengths win).
 */
export function pickWord(
  level: Level,
  language: string,
  recentIds: readonly string[],
  rng: () => number = Math.random,
  words: readonly WordEntry[] = WORDS,
): WordEntry {
  const inLanguage = words.filter((w) => w.language === language);
  if (inLanguage.length === 0) throw new Error(`No words for language "${language}"`);
  const recent = new Set(recentIds);
  const fits = (w: WordEntry) => w.word.length >= level.minLength && w.word.length <= level.maxLength;
  const pick = (list: WordEntry[]) => list[Math.floor(rng() * list.length)];

  const fresh = inLanguage.filter((w) => fits(w) && !recent.has(w.id));
  if (fresh.length) return pick(fresh);
  const any = inLanguage.filter(fits);
  if (any.length) return pick(any);

  const gap = (w: WordEntry) =>
    Math.max(0, level.minLength - w.word.length, w.word.length - level.maxLength);
  const best = Math.min(...inLanguage.map(gap));
  return pick(inLanguage.filter((w) => gap(w) === best));
}
