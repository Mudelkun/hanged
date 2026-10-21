/*
 * Builds and validates the word database (data/words.json).
 *   npm run check:words                   check data/words.json
 *   npm run check:words -- --build        rebuild it from scripts/words-source.txt and the dictionary, then check it
 *   npm run check:words -- --senses rose  list a word's dictionary senses, to pick one for the source file
 * Source lines are `word | sense | hint, hint, hint`. The sense is an Open
 * English WordNet synset id (e.g. 02124272-n): the word's description is that
 * sense's definition, never text written by hand (scripts/wordnet.js).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'words.json');
const SOURCE_PATH = path.join(__dirname, 'words-source.txt');
const LANGUAGE = 'en';
const MIN_HINTS = 2;
const MAX_HINTS = 4;
/** Fits the description card in 4 lines on a 375 pt phone. */
const MAX_DESCRIPTION_LENGTH = 140;

const tokens = (text) => text.toLowerCase().match(/[a-z]+/g) ?? [];

/**
 * A description word gives the answer away if it starts with it ("roses" for
 * rose) or shares most of its stem ("paleontology" for paleontologist,
 * "dancing" for dance). Compound parts ("light" in lighthouse) are allowed.
 */
function givesAway(word, token) {
  if (token.startsWith(word)) return true;
  let common = 0;
  while (common < word.length && word[common] === token[common]) common++;
  return common >= Math.max(4, Math.ceil(word.length * 0.6));
}

const revealsWord = (word, text) => tokens(text).some((t) => givesAway(word, t));

/**
 * The description for `word` from a dictionary definition, kept verbatim except:
 * a leading label such as "(astronomy)" is dropped, so are the "; "-separated
 * clauses that give the word away, then trailing clauses until it fits the card.
 * null when nothing usable is left.
 */
function describe(word, definition) {
  let clauses = definition
    .replace(/^(\([^)]*\)\s*)+/, '')
    .split(/;\s*/)
    .map((c) => c.trim())
    .filter((c) => c && !revealsWord(word, c));
  while (clauses.length > 1 && clauses.join('; ').length + 1 > MAX_DESCRIPTION_LENGTH) clauses = clauses.slice(0, -1);
  const text = clauses.join('; ');
  if (!text || text.length + 1 > MAX_DESCRIPTION_LENGTH) return null;
  return text[0].toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? '' : '.');
}

/** The game word is this dictionary lemma, or its plural or -ing form ("fireworks", "rollercoaster"). */
function isFormOf(word, lemma) {
  const l = lemma.replace(/[\s'-]/g, '');
  return [l, `${l}s`, `${l}es`, `${l}ren`, `${l}ing`, `${l.replace(/e$/, '')}ing`, l.replace(/y$/, 'ies')].includes(word);
}

function readSource() {
  return fs
    .readFileSync(SOURCE_PATH, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [word = '', sense = '', hints = ''] = l.split('|').map((part) => part.trim());
      return { word: word.toLowerCase(), sense, hints: hints.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean) };
    });
}

async function build() {
  const wn = await require('./wordnet').loadWordNet();
  const errors = [];
  const words = readSource().map(({ word, sense, hints }) => {
    const synset = wn.synset(sense);
    let description = '';
    if (!synset) errors.push(`"${word}": unknown sense "${sense}" (try --senses ${word})`);
    else if (!synset.lemmas.some((l) => isFormOf(word, l))) errors.push(`"${word}": sense ${sense} is for ${synset.lemmas.join(', ')}`);
    else if (!(description = describe(word, synset.definition)))
      errors.push(`"${word}": sense ${sense} gives the word away or is too long, pick another (--senses ${word})`);
    return { id: `${LANGUAGE}-${word}`, word, language: LANGUAGE, description, hints, sense: `oewn-${sense}` };
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  fs.writeFileSync(JSON_PATH, JSON.stringify(words, null, 2) + '\n');
  console.log(`Wrote ${words.length} words to data/words.json (Open English WordNet ${wn.edition})`);
}

async function listSenses(word) {
  const wn = await require('./wordnet').loadWordNet();
  const senses = wn.sensesOf(word);
  if (!senses.length) console.log(`"${word}" is not in the dictionary. Try its singular or base form.`);
  for (const s of senses) console.log(`${s.id}  ${describe(word, s.definition) ?? '(unusable)'}\n            ${s.definition}`);
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
    if (!/^oewn-\d{8}-[nvasr]$/.test(w.sense ?? '')) errors.push(`${where}: missing dictionary sense`);
    if (!w.description || !w.description.trim()) errors.push(`${where}: missing description`);
    else if (revealsWord(w.word, w.description)) errors.push(`${where}: description gives the word away`);
    else if (w.description.length > MAX_DESCRIPTION_LENGTH) errors.push(`${where}: description over ${MAX_DESCRIPTION_LENGTH} characters`);
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

async function main() {
  const i = process.argv.indexOf('--senses');
  if (i > 0) return listSenses(process.argv[i + 1] ?? '');
  if (process.argv.includes('--build')) await build();
  check();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
