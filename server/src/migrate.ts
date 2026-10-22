/*
 * Applies src/migrations/*.sql in name order, each once, each in a transaction.
 * Never edit an applied migration: add the next number.
 */
import { readdir, readFile } from 'node:fs/promises';

import type { Db } from './db.ts';

const DIR = new URL('./migrations/', import.meta.url);

export async function migrate(db: Db): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const todo = (await readdir(DIR)).filter((f) => f.endsWith('.sql') && !done.has(f)).sort();
  for (const name of todo) {
    const text = await readFile(new URL(name, DIR), 'utf8');
    await db.tx(async (sql) => {
      await sql.exec(text);
      await sql.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
  }
  return todo;
}
