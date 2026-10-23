/*
 * Starts the server. With DATABASE_URL (Railway) it uses PostgreSQL; without
 * it (local dev) an embedded PGlite in ./.pglite. Either way the word list is
 * copied in from server/data/ whenever it changed (Versus deals from it).
 */
import { buildApp } from './app.ts';
import { embedded, postgres } from './db.ts';
import { migrate } from './migrate.ts';
import { syncWords } from './words.ts';

const url = process.env.DATABASE_URL;
const db = url ? postgres(url) : await embedded(process.env.PGLITE_DIR ?? '.pglite');
const applied = await migrate(db);
const seeded = await syncWords(db);

const app = await buildApp(db, {
  logger: true,
  adminToken: process.env.ADMIN_TOKEN,
  versusForcedOff: process.env.VERSUS_DISABLED === '1',
});
if (applied.length) app.log.info({ applied }, 'migrations applied');
if (seeded !== null) app.log.info({ words: seeded }, 'word list updated');
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });

// Railway sends SIGTERM on redeploy: Versus matches get VERSUS_DRAIN_SECONDS to finish (keep it
// under RAILWAY_DEPLOYMENT_DRAINING_SECONDS), then the requests in flight finish and the pool closes.
const drainMs = Number(process.env.VERSUS_DRAIN_SECONDS ?? 0) * 1000;
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, async () => {
    await app.hub.drain(signal === 'SIGTERM' ? drainMs : 0);
    await app.close();
    await db.close();
    process.exit(0);
  });
