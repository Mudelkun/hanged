/*
 * Starts the server. With DATABASE_URL (Railway) it uses PostgreSQL; without
 * it (local dev) an embedded PGlite in ./.pglite, seeded with the word list.
 */
import { buildApp } from './app.ts';
import { embedded, postgres } from './db.ts';
import { migrate } from './migrate.ts';
import { seedWords } from './words.ts';

const url = process.env.DATABASE_URL;
const db = url ? postgres(url) : await embedded(process.env.PGLITE_DIR ?? '.pglite');
const applied = await migrate(db);
if (!url) await seedWords(db);

const app = await buildApp(db, { logger: true });
if (applied.length) app.log.info({ applied }, 'migrations applied');
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });

// Railway sends SIGTERM on redeploy: finish the requests in flight, then close the pool.
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
