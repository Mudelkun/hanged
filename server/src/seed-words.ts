/*
 * npm run seed:words [-- path/to/words.json]
 * Copies the word list into the database at DATABASE_URL. Run it after
 * `npm run check:words -- --build` changes data/words.json.
 */
import { postgres } from './db.ts';
import { migrate } from './migrate.ts';
import { seedWords } from './words.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL (Railway: the Postgres service\'s public URL)');
const db = postgres(url);
await migrate(db);
console.log(`${await seedWords(db, process.argv[2])} words seeded`);
await db.close();
