/*
 * The word database: a JSON file bundled with the app (data/words.json).
 * It stays on the device so every level plays offline; the server never
 * serves words. Keep every read behind this module.
 */
import { isLanguage, Language } from './languages';
import type { Level } from './levels';

export interface WordEntry {
  id: string;
  word: string;
  language: string;
  /** A concise clue in the entry's language; provenance is documented in data/CREDITS.md. */
  description: string;
  /** Dictionary sense (English) or original authored clue ID (other languages). */
  sense: string;
  /** How common the word is: 10 (everyone knows it) to 50 (a medium dictionary). Levels cap it (Level.maxRarity). */
  rarity: number;
  /** A thing you can picture (an animal, food, an object, a person…). Easy levels deal only these (Level.concreteOnly). */
  concrete: boolean;
  /** Misses a typical player makes on it, measured at build time (scripts/difficulty.js). Levels cap it (Level.maxDifficulty). */
  difficulty: number;
  /** Its subject key ("animal", "material", "describing"…), shown free on hard levels (Level.showsSubject). */
  subject: string;
}

// Static require paths let Metro bundle all packs; only the requested pack is evaluated.
const LOADERS: Record<Language, () => readonly WordEntry[]> = {
  en: () => require('../../data/words.json'),
  fr: () => require('../../data/words/fr.json'),
  es: () => require('../../data/words/es.json'),
  de: () => require('../../data/words/de.json'),
};
const PACKS = new Map<string, readonly WordEntry[]>();
const INDEXES = new Map<string, Map<string, WordEntry>>();
export function wordsForLanguage(language: string): readonly WordEntry[] {
  if (!isLanguage(language)) return [];
  if (!PACKS.has(language)) PACKS.set(language, LOADERS[language]());
  return PACKS.get(language)!;
}
export function wordById(id: string): WordEntry | undefined {
  const language = id.split('-')[0];
  if (!isLanguage(language)) return undefined;
  if (!INDEXES.has(language)) INDEXES.set(language, new Map(wordsForLanguage(language).map(w => [w.id, w])));
  return INDEXES.get(language)!.get(id);
}

const POOLS = new Map<string, readonly WordEntry[]>();

/** The entries `distance` puts closest to 0 (all of them when several tie). */
function closest(words: readonly WordEntry[], distance: (w: WordEntry) => number): WordEntry[] {
  let best = Infinity;
  for (const w of words) best = Math.min(best, distance(w));
  return words.filter((w) => distance(w) === best);
}

/**
 * The words a level deals: those in its length range, of the kind it deals
 * (only things on easy levels), common enough, and not too hard to guess.
 * When none fit, the closest lengths, then the right kind, then the most
 * common, then the easiest. Cached for the bundled database.
 */
export function levelPool(level: Level, language: string, words: readonly WordEntry[] = wordsForLanguage(language)): readonly WordEntry[] {
  const key = `${language}:${level.minLength}-${level.maxLength}:${level.concreteOnly}:${level.maxRarity}:${level.maxDifficulty}`;
  const bundled = words === wordsForLanguage(language);
  const cached = bundled && POOLS.get(key);
  if (cached) return cached;
  const inLanguage = words.filter((w) => w.language === language);
  if (inLanguage.length === 0) throw new Error(`No words for language "${language}"`);
  const byLength = closest(inLanguage, (w) => Math.max(0, level.minLength - w.word.length, w.word.length - level.maxLength));
  const byKind = closest(byLength, (w) => (level.concreteOnly && !w.concrete ? 1 : 0));
  const byRarity = closest(byKind, (w) => Math.max(0, w.rarity - level.maxRarity));
  const pool = closest(byRarity, (w) => Math.max(0, w.difficulty - level.maxDifficulty));
  if (bundled) POOLS.set(key, pool);
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
  words: readonly WordEntry[] = wordsForLanguage(language),
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
  words: readonly WordEntry[] = wordsForLanguage(word.language),
): string[] {
  if (!seenIds.includes(word.id)) return [...seenIds, word.id];
  const restart = new Set(levelPool(level, word.language, words).map((w) => w.id));
  return [...seenIds.filter((id) => !restart.has(id)), word.id];
}
