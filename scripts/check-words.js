/*
 * Builds and validates the word database (data/words.json).
 *   npm run check:words                   check data/words.json
 *   npm run check:words -- --build        rebuild it from the dictionaries, then check it
 *   npm run check:words -- --senses rose  list a word's dictionary senses, to pick one for the source file
 * The database is the hand-written words of scripts/words-source.txt, then
 * every common English word the generator finds (scripts/auto-words.js), each
 * with how many misses it costs a typical player (scripts/difficulty.js).
 * Source lines are `word | sense | hint, hint, hint`. The sense is an Open
 * English WordNet synset id (e.g. 02124272-n): the word's description is that
 * sense's definition, never text written by hand (scripts/wordnet.js).
 */
const fs = require('fs');
const path = require('path');
const { describe, revealsWord, subjectOf, MIN_HINTS, MAX_HINTS, MAX_DESCRIPTION_LENGTH, SUBJECTS } = require('./words-rules');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'words.json');
const SOURCE_PATH = path.join(__dirname, 'words-source.txt');
const LANGUAGE = 'en';
/**
 * How common a word is: SCOWL's sizes (scripts/scowl.js), 10 = the most common.
 * Hand-written words count as 10: they were picked as words everyone knows,
 * and SCOWL, counted from adult text, rates "owl" or "zebra" 35.
 */
const RARITIES = [10, 20, 35, 40, 50];
const HAND_WRITTEN_RARITY = RARITIES[0];
/** Hand-written words were also picked as easy to guess, so easy levels deal them (Level.concreteOnly). */
const HAND_WRITTEN_CONCRETE = true;

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

const entry = ({ word, description, hints, sense, rarity, concrete }) => ({
  id: `${LANGUAGE}-${word}`,
  word,
  language: LANGUAGE,
  description,
  hints,
  sense: `oewn-${sense}`,
  rarity,
  concrete,
});

/** One word per line: a 20,000-word file stays readable and diffs line by line. */
const serialize = (words) => `[\n${words.map((w) => JSON.stringify(w)).join(',\n')}\n]\n`;

async function build() {
  const wn = await require('./wordnet').loadWordNet();
  const scowl = await require('./scowl').loadScowl();
  const errors = [];
  const handWritten = readSource().map(({ word, sense, hints }) => {
    const synset = wn.synset(sense);
    let description = '';
    if (!synset) errors.push(`"${word}": unknown sense "${sense}" (try --senses ${word})`);
    else if (!synset.lemmas.some((l) => isFormOf(word, l))) errors.push(`"${word}": sense ${sense} is for ${synset.lemmas.join(', ')}`);
    else if (!(description = describe(word, synset.definition)))
      errors.push(`"${word}": sense ${sense} gives the word away or is too long, pick another (--senses ${word})`);
    return entry({ word, description, hints, sense, rarity: HAND_WRITTEN_RARITY, concrete: HAND_WRITTEN_CONCRETE });
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  const taken = new Set(handWritten.map((w) => w.word));
  const { words: generated, rejected } = require('./auto-words').generateWords(wn, scowl);
  const words = [...handWritten, ...generated.filter((w) => !taken.has(w.word)).map((w) => entry({ ...w, rarity: w.size }))];
  const difficulty = require('./difficulty').measureDifficulty(words);
  for (const w of words) {
    w.subject = subjectOf(wn.synset(w.sense.replace(/^oewn-/, '')).lexfile);
    w.difficulty = difficulty.get(w.word);
  }
  fs.writeFileSync(JSON_PATH, serialize(words));
  console.log(
    `Wrote ${words.length} words to data/words.json: ${handWritten.length} hand-written, ${words.length - handWritten.length} generated ` +
      `(Open English WordNet ${wn.edition}, SCOWL ${scowl.release}). Left out:`,
    rejected,
  );
}

async function listSenses(word) {
  const wn = await require('./wordnet').loadWordNet();
  const senses = wn.sensesOf(word);
  if (!senses.length) console.log(`"${word}" is not in the dictionary. Try its singular or base form.`);
  for (const { synset: id, count } of senses) {
    const { definition } = wn.synset(id);
    console.log(`${id}  ${describe(word, definition) ?? '(unusable)'}  [used ${count}x]\n            ${definition}`);
  }
}

const tally = (counts, key) => (counts[key] = (counts[key] || 0) + 1);

function check() {
  const words = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const errors = [];
  const ids = new Set();
  const byLength = {};
  const byRarity = {};
  let concrete = 0;
  for (const w of words) {
    const where = `"${w.word}" (${w.id})`;
    if (!/^[a-z]{1,15}$/.test(w.word)) errors.push(`${where}: must be 1-15 lowercase letters a-z`);
    if (new Set(w.word).size < 2) errors.push(`${where}: needs at least 2 distinct letters`);
    if (!w.language) errors.push(`${where}: missing language`);
    if (!/^oewn-\d{8}-[nvasr]$/.test(w.sense ?? '')) errors.push(`${where}: missing dictionary sense`);
    if (!RARITIES.includes(w.rarity)) errors.push(`${where}: rarity must be one of ${RARITIES.join(', ')}`);
    if (!Number.isInteger(w.difficulty) || w.difficulty < 0 || w.difficulty > 25) errors.push(`${where}: difficulty must be a miss count, 0-25`);
    if (!SUBJECTS.includes(w.subject)) errors.push(`${where}: subject must be one of ${SUBJECTS.join(', ')}`);
    if (typeof w.concrete !== 'boolean') errors.push(`${where}: concrete must be true or false`);
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
    tally(byLength, w.word.length);
    tally(byRarity, w.rarity);
    if (w.concrete) concrete++;
  }
  console.log(
    `${words.length} words, ${concrete} of them things you can picture.\nBy length:`,
    byLength,
    '\nBy rarity (SCOWL size, 10 = most common):',
    byRarity,
  );
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
