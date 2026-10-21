/*
 * Validates the word database (data/words.json) against the word rules.
 *   npm run check:words             check data/words.json
 *   npm run check:words -- --build  rebuild data/words.json from scripts/words-source.txt, then check it
 * Source lines are `word | description | hint, hint, hint`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'words.json');
const SOURCE_PATH = path.join(__dirname, 'words-source.txt');
const LANGUAGE = 'en';
const MIN_HINTS = 2;
const MAX_HINTS = 4;

function build() {
  const words = fs
    .readFileSync(SOURCE_PATH, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [word = '', description = '', hints = ''] = l.split('|').map((part) => part.trim());
      const w = word.toLowerCase();
      return {
        id: `${LANGUAGE}-${w}`,
        word: w,
        language: LANGUAGE,
        description,
        hints: hints.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
      };
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
    const hints = Array.isArray(w.hints) ? w.hints : [];
    if (hints.length < MIN_HINTS || hints.length > MAX_HINTS) errors.push(`${where}: needs ${MIN_HINTS}-${MAX_HINTS} hints`);
    if (new Set(hints).size !== hints.length) errors.push(`${where}: duplicate hint`);
    for (const h of hints) {
      if (!/^[a-z]{2,12}$/.test(h)) errors.push(`${where}: hint "${h}" must be one word of 2-12 letters a-z`);
      else if (h.includes(w.word) || w.word.includes(h)) errors.push(`${where}: hint "${h}" gives the word away`);
    }
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
