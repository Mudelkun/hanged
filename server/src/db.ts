/*
 * The database, behind the smallest interface the server needs, so the same
 * code runs on PostgreSQL (Railway) and on PGlite (Postgres in-process, for
 * tests and for `npm run dev` without a DATABASE_URL).
 */
import pg from 'pg';

export interface Sql {
  /** One statement, with $1… parameters. */
  query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
  /** Several statements, no parameters (migrations). */
  exec(text: string): Promise<void>;
}

export interface Db extends Sql {
  /** Runs `fn` in a transaction: committed if it resolves, rolled back if it throws. */
  tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const pgSql = (q: pg.Pool | pg.PoolClient): Sql => ({
  query: async <R>(text: string, params?: unknown[]) => ({ rows: (await q.query(text, params)).rows as R[] }),
  exec: async (text) => void (await q.query(text)),
});

export function postgres(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    ...pgSql(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(pgSql(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** PGlite, in memory or in `dir`. A dev dependency: never loaded when DATABASE_URL is set. */
export async function embedded(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dir);
  type Q = Pick<typeof db, 'query' | 'exec'>;
  const sql = (q: Q): Sql => ({
    query: async <R>(text: string, params?: unknown[]) => ({ rows: (await q.query<R>(text, params)).rows }),
    exec: async (text) => void (await q.exec(text)),
  });
  return { ...sql(db), tx: (fn) => db.transaction((t) => fn(sql(t))), close: () => db.close() };
}
