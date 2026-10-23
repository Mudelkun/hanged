/*
 * npm run seed:words [-- path/to/words.json.gz]
 * Copies the word list (server/data/words.json.gz) into the database at
 * DATABASE_URL now. Rarely needed: the server does it by itself at start
 * whenever the list changed (words.ts, syncWords).
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
