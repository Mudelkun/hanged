/*
 * Validates the word database (data/words.json) against the word rules.
 *   npm run check:words             check data/words.json
 *   npm run check:words -- --build  rebuild data/words.json from scripts/words-source.txt, then check it
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'words.json');
const SOURCE_PATH = path.join(__dirname, 'words-source.txt');
const LANGUAGE = 'en';

function build() {
  const words = fs
    .readFileSync(SOURCE_PATH, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [word, ...rest] = l.split('|');
      const w = word.trim().toLowerCase();
      return { id: `${LANGUAGE}-${w}`, word: w, language: LANGUAGE, description: rest.join('|').trim() };
    });
  fs.writeFileSync(JSON_PATH, JSON.stringify(words, null, 2) + '\n');
  console.log(`Wrote ${words.length} words to data/words.json`);
}

function check() {
  const words = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const errors = [];
  const ids = new Set();
  const byLength = {};
  for (const w of words) {
    const where = `"${w.word}" (${w.id})`;
    if (!/^[a-z]{1,15}$/.test(w.word)) errors.push(`${where}: must be 1-15 lowercase letters a-z`);
    if (new Set(w.word).size < 2) errors.push(`${where}: needs at least 2 distinct letters`);
    if (!w.language) errors.push(`${where}: missing language`);
    if (!w.description || !w.description.trim()) errors.push(`${where}: missing description`);
    else if (w.description.toLowerCase().includes(w.word)) errors.push(`${where}: description gives the word away`);
    if (ids.has(w.id)) errors.push(`${where}: duplicate id`);
    ids.add(w.id);
    byLength[w.word.length] = (byLength[w.word.length] || 0) + 1;
  }
  console.log(`${words.length} words. By length:`, byLength);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('All words valid.');
}

if (process.argv.includes('--build')) build();
check();
