/*
 * The word list on the server: the statistics show each word from it, and
 * Versus deals its words from it (versus/words.ts: the server picks a Versus
 * word, so the guesser's device never holds it). Solo never reads words from
 * the server.
 *
 * The server ships its own copy of the packs, server/data/words.json.gz
 * (`npm run build:server-words` at the repo root writes it from data/; a test
 * checks it's up to date), because Railway deploys only server/. At start the
 * server copies it into the `words` table whenever it changed (syncWords), so
 * a deploy is all a word change needs.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { Sql } from './db.ts';

export const WORDS_BUNDLE = new URL('../data/words.json.gz', import.meta.url);

/** A word as data/ has it (more fields there; these are the ones the server keeps). */
export interface WordEntry {
  id: string;
  word: string;
  language: string;
  description: string;
  subject: string;
  rarity: number;
  difficulty: number;
}

/** One row of the bundle: the id is `${language}-${word}`. */
type Row = [language: string, word: string, description: string, subject: string, rarity: number, difficulty: number];

/** The bundle's bytes for these entries. Deterministic (gzip without a timestamp), so its hash changes only with the words. */
export function toBundle(entries: readonly WordEntry[]): Buffer {
  const rows: Row[] = entries.map((w) => [w.language, w.word, w.description, w.subject, w.rarity, w.difficulty]);
  return gzipSync(JSON.stringify(rows), { level: 9 });
}

export function fromBundle(bytes: Buffer): WordEntry[] {
  const rows = JSON.parse(gunzipSync(bytes).toString('utf8')) as Row[];
  return rows.map(([language, word, description, subject, rarity, difficulty]) => ({
    id: `${language}-${word}`, word, language, description, subject, rarity, difficulty,
  }));
}

/**
 * Copies the bundle into the `words` table, and drops words no longer in it
 * (a word taken out of the game must not be dealt in Versus; the statistics
 * keep their counts). Returns how many words there are.
 */
export async function seedWords(sql: Sql, file: URL | string = WORDS_BUNDLE): Promise<number> {
  const words = fromBundle(await readFile(file));
  const col = <K extends keyof WordEntry>(k: K) => words.map((w) => w[k]);
  await sql.query(
    `INSERT INTO words (id, word, language, description, subject, rarity, difficulty)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[])
     ON CONFLICT (id) DO UPDATE SET
       word = excluded.word, language = excluded.language, description = excluded.description,
       subject = excluded.subject, rarity = excluded.rarity, difficulty = excluded.difficulty`,
    [col('id'), col('word'), col('language'), col('description'), col('subject'), col('rarity'), col('difficulty')],
  );
  // An anti-join (hashed), not NOT IN / <> ALL, which can compare every row with every id
  await sql.query('DELETE FROM words w WHERE NOT EXISTS (SELECT 1 FROM unnest($1::text[]) AS k(id) WHERE k.id = w.id)', [col('id')]);
  return words.length;
}

/**
 * At start: seeds the table if the bundle changed since the last seed (its
 * hash is kept in `settings`). null: nothing to do.
 */
export async function syncWords(sql: Sql, file: URL | string = WORDS_BUNDLE): Promise<number | null> {
  const hash = createHash('sha256').update(await readFile(file)).digest('hex');
  const { rows } = await sql.query<{ value: { hash: string } }>(`SELECT value FROM settings WHERE key = 'words'`);
  if (rows[0]?.value.hash === hash) return null;
  const count = await seedWords(sql, file);
  await sql.query(
    `INSERT INTO settings (key, value) VALUES ('words', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [JSON.stringify({ hash, count })],
  );
  return count;
}
