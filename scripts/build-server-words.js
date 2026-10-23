// npm run build:server-words
// Writes server/data/words.json.gz, the server's copy of the word packs (data/words.json and
// data/words/<language>.json). Railway deploys only server/, so the server ships its own copy and
// seeds its database from it at start (server/src/words.ts). Run it after any change to the packs;
// a server test fails while the copy is out of date.
const fs = require('node:fs');
const path = require('node:path');

const { toBundle } = require('../server/src/words.ts');

const root = path.join(__dirname, '..');
const files = ['data/words.json', ...['fr', 'es', 'de'].map((language) => `data/words/${language}.json`)];
const entries = files.flatMap((file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
const out = path.join(root, 'server', 'data', 'words.json.gz');
fs.mkdirSync(path.dirname(out), { recursive: true });
const bytes = toBundle(entries);
fs.writeFileSync(out, bytes);
console.log(`${entries.length} words → server/data/words.json.gz (${(bytes.length / 1024).toFixed(0)} KB)`);
