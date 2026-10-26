/*
 * The words Versus deals. The server picks them (the `words` table, which the
 * server fills from its own copy at start: ../words.ts), so a device never
 * holds a word before it's guessed.
 * The dealing pool is the everyday words (the same familiarity as solo
 * levels 1-15), loaded once into memory: a few thousand short rows. A word
 * typed in Word Duel is looked up one at a time and may be any word of the
 * language's pack.
 */
import type { Db } from '../db.ts';
import { validateWord } from '../engine.ts';
import { MODES } from '../versus-contract.ts';

export interface VersusWord {
  id: string;
  word: string;
  language: string;
  description: string;
  subject: string | null;
}

/** Everyday words of a playable length: rarity and difficulty as solo levels 1-15 (src/game/levels.ts). */
const POOL = `SELECT id, word, language, description, subject FROM words
              WHERE description IS NOT NULL AND rarity <= 20 AND difficulty <= 8 AND char_length(word) BETWEEN 5 AND 10`;

/** An empty pool (table not seeded yet) is read again at most this often. */
const RETRY_MS = 60_000;

export interface WordSource {
  /** `count` different words of `language` not in `exclude`, in random order (fewer if the pool runs out). */
  deal(language: string, count: number, rng: () => number, exclude?: ReadonlySet<string>): VersusWord[];
  has(language: string): boolean;
  /** The language's dealing pool itself: a bot matches what a word shows against it (bots.ts). */
  pool(language: string): readonly VersusWord[];
  /** Words in each language's dealing pool (the admin page shows them: 0 means Versus can't start there). */
  sizes(): Record<string, number>;
  /** A typed word (Word Duel), if it's a word of the language's pack. */
  find(language: string, raw: string): Promise<VersusWord | null>;
}

export async function loadWords(db: Db): Promise<WordSource> {
  let pools = new Map<string, VersusWord[]>();
  let loadedAt = 0;
  async function load() {
    loadedAt = Date.now();
    const { rows } = await db.query<VersusWord>(POOL);
    const next = new Map<string, VersusWord[]>();
    for (const w of rows) {
      const pool = next.get(w.language) ?? [];
      pool.push(w);
      next.set(w.language, pool);
    }
    pools = next;
  }
  await load();

  return {
    has(language) {
      const ok = (pools.get(language)?.length ?? 0) > 0;
      if (!ok && Date.now() - loadedAt > RETRY_MS) load().catch(() => {});
      return ok;
    },

    pool: (language) => pools.get(language) ?? [],

    sizes: () => Object.fromEntries([...pools].map(([language, pool]) => [language, pool.length])),

    deal(language, count, rng, exclude) {
      const pool = pools.get(language) ?? [];
      const picked: VersusWord[] = [];
      const taken = new Set<number>();
      // Random draws: the pool is thousands of words and a match takes dozens, so a
      // draw rarely repeats. Bounded, so a tiny pool can't loop forever.
      for (let tries = 0; picked.length < count && tries < count * 20 && taken.size < pool.length; tries++) {
        const i = Math.floor(rng() * pool.length);
        if (taken.has(i)) continue;
        taken.add(i);
        if (!exclude?.has(pool[i].id)) picked.push(pool[i]);
      }
      return picked;
    },

    async find(language, raw) {
      const checked = validateWord(raw, language);
      if (!checked.ok || checked.word.length < MODES.duel.typedMin) return null;
      const { rows } = await db.query<VersusWord>(
        'SELECT id, word, language, description, subject FROM words WHERE id = $1 AND description IS NOT NULL',
        [`${language}-${checked.word}`],
      );
      return rows[0] ?? null;
    },
  };
}
