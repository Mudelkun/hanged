/*
 * Copies the word list (data/words.json, the one the app ships) into the
 * `words` table. The statistics show each word from it, and Versus deals its
 * words from it (versus/words.ts): the server picks a Versus word, so the
 * guesser's device never holds it. Solo never reads words from the server.
 */
import { readFile } from 'node:fs/promises';

import type { Sql } from './db.ts';

export const WORDS_FILE = new URL('../../data/words.json', import.meta.url);

export const WORD_FILES = [WORDS_FILE, ...['fr', 'es', 'de'].map(language => new URL(`../../data/words/${language}.json`, import.meta.url))];

interface WordRow {
  id: string;
  word: string;
  language: string;
  description: string;
  subject?: string;
  rarity?: number;
  difficulty?: number;
}

export async function seedWords(sql: Sql, file?: URL | string): Promise<number> {
  const packs = await Promise.all((file ? [file] : WORD_FILES).map(async source => JSON.parse(await readFile(source, 'utf8'))));
  const words: WordRow[] = packs.flat();
  const col = <K extends keyof WordRow>(k: K) => words.map((w) => w[k] ?? null);
  await sql.query(
    `INSERT INTO words (id, word, language, description, subject, rarity, difficulty)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[])
     ON CONFLICT (id) DO UPDATE SET
       word = excluded.word, language = excluded.language, description = excluded.description,
       subject = excluded.subject, rarity = excluded.rarity, difficulty = excluded.difficulty`,
    [col('id'), col('word'), col('language'), col('description'), col('subject'), col('rarity'), col('difficulty')],
  );
  return words.length;
}
