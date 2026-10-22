/*
 * Copies the word list (data/words.json, the one the app ships) into the
 * `words` table, so the statistics can show each word. The game never reads
 * words from the server.
 */
import { readFile } from 'node:fs/promises';

import type { Sql } from './db.ts';

export const WORDS_FILE = new URL('../../data/words.json', import.meta.url);

export async function seedWords(sql: Sql, file: URL | string = WORDS_FILE): Promise<number> {
  const words: { id: string; word: string; language: string }[] = JSON.parse(await readFile(file, 'utf8'));
  await sql.query(
    `INSERT INTO words (id, word, language)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     ON CONFLICT (id) DO UPDATE SET word = excluded.word, language = excluded.language`,
    [words.map((w) => w.id), words.map((w) => w.word), words.map((w) => w.language)],
  );
  return words.length;
}
