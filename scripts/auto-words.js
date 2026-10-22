/*
 * Generates words for data/words.json from the dictionaries, so the database
 * can hold every common English word instead of a hand-made list:
 * - the words: Open English WordNet lemmas of 3–15 letters a–z that SCOWL
 *   (scripts/scowl.js) counts as common, minus names, slurs and obscenities;
 * - nothing from scripts/blocked-words.txt in the word or its description;
 * - the sense: the most used one (Princeton tag counts) whose definition makes
 *   a usable description (describe in scripts/words-rules.js), among
 *   the word's main senses only (a word whose main senses all fail is left out);
 * Hand-written lines in scripts/words-source.txt win over generated ones.
 */
const fs = require('fs');
const path = require('path');
const { describe } = require('./words-rules');

/** SCOWL size a game word needs: up to 50 = a medium dictionary (35 small, 60 the usual spell checker). */
const MAX_WORD_SIZE = 50;
const MIN_LENGTH = 3;
const MAX_LENGTH = 15;

/** Usage labels (synsets the senses "exemplify"). A word with an offensive sense is never dealt. */
const OFFENSIVE = new Set(['07139048-n' /* obscenity */, '06731706-n' /* ethnic slur */]);
/** Senses with these labels are skipped, but the word may still come with another sense. */
const SKIPPED_USAGE = new Set([
  '06730109-n', // disparagement
  '07171981-n', // slang
  '07087487-n', // archaism
  '06864792-n', // trademark
  '06858649-n', // brand name
  '06306016-n', // plural form
  '06318142-n', // combining form
  '07106330-n', // acronym
]);
/** Senses that are names, places or people's groups in disguise, or too vague to guess. */
const SKIPPED_LEXFILES = new Set(['noun.Tops']);
/**
 * Senses that name a thing you can picture: animals, food, plants, the body,
 * made things, natural things, materials and people. Easy levels deal only
 * these (Level.concreteOnly): "badly" or "adhere" are common but hard to guess.
 * Phenomena, places and times are left out: they mix "storm" with "effect".
 */
const CONCRETE_LEXFILES = new Set([
  'noun.animal',
  'noun.food',
  'noun.plant',
  'noun.body',
  'noun.artifact',
  'noun.object',
  'noun.substance',
  'noun.person',
]);

const BLOCKED_PATH = path.join(__dirname, 'blocked-words.txt');

const readBlocked = () =>
  new Set(
    fs
      .readFileSync(BLOCKED_PATH, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean),
  );

/** A main sense is a word's most used one, or any of its next MAIN_SENSES - 1 that was ever tagged in real text. */
const MAIN_SENSES = 3;

const exemplifies = (synset, labels) => (synset.relations.exemplifies ?? []).some((u) => labels.has(u));

/**
 * The dictionary lists some plurals as words of their own ("hands", "years").
 * They make poor answers when the singular is a noun used at least as often
 * ("hand": 215 tags, "hands": 10). "physics" and "species" stay: "physic"
 * and "specie" are rarer than them.
 */
function isPlural(wn, word) {
  const plural = word.match(/^(.+?)(es|s)$/);
  if (!plural) return false;
  const [, stem, ending] = plural;
  const singulars = ending === 's' ? [stem] : [stem, `${stem}e`, stem.replace(/i$/, 'y')];
  const used = (lemma, pos = '') => Math.max(-1, ...wn.sensesOf(lemma).filter((s) => !s.proper && s.synset.endsWith(pos)).map((s) => s.count));
  return singulars.some((base) => used(base, '-n') > 0 && used(base, '-n') >= used(word));
}

/**
 * The generated words, alphabetical, as `{ word, sense, description, size, concrete }`,
 * and how many candidates each check turned away.
 */
function generateWords(wn, scowl) {
  const blocked = readBlocked();
  const words = [];
  const rejected = { blocked: 0, offensive: 0, noSense: 0 };
  for (const word of [...wn.lemmas()].sort()) {
    const size = scowl.sizeOf(word);
    if (!/^[a-z]+$/.test(word) || word.length < MIN_LENGTH || word.length > MAX_LENGTH || !(size <= MAX_WORD_SIZE)) continue;
    if (new Set(word).size < 2 || isPlural(wn, word)) continue;
    const senses = wn.sensesOf(word).filter((s) => !s.proper);
    if (!senses.length) continue;
    if (blocked.has(word)) {
      rejected.blocked++;
      continue;
    }
    if (senses.some((s) => exemplifies(wn.synset(s.synset), OFFENSIVE))) {
      rejected.offensive++;
      continue;
    }
    let best = null;
    let reason = 'noSense';
    for (const [index, { synset: id, count }] of senses.entries()) {
      if (index >= MAIN_SENSES || (index > 0 && count === 0)) break;
      const synset = wn.synset(id);
      if (exemplifies(synset, SKIPPED_USAGE) || SKIPPED_LEXFILES.has(synset.lexfile)) continue;
      const description = describe(word, synset.definition);
      if (!description) continue;
      if ((description.toLowerCase().match(/[a-z]+/g) ?? []).some((t) => blocked.has(t))) {
        reason = 'blocked';
        break;
      }
      best = { word, sense: id, description, size, concrete: CONCRETE_LEXFILES.has(synset.lexfile) };
      break;
    }
    if (best) words.push(best);
    else rejected[reason]++;
  }
  return { words, rejected };
}

module.exports = { generateWords };
