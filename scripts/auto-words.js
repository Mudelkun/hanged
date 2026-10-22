/*
 * Generates words for data/words.json from the dictionaries, so the database
 * can hold every common English word instead of a hand-made list:
 * - the words: Open English WordNet lemmas of 3–15 letters a–z that SCOWL
 *   (scripts/scowl.js) counts as common, minus names, slurs and obscenities;
 * - nothing from scripts/blocked-words.txt in the word, its hints or its description;
 * - the sense: the most used one (Princeton tag counts) whose definition makes
 *   a usable description (describe in scripts/words-rules.js) and hints, among
 *   the word's main senses only (a word whose main senses all fail is left out);
 * - the hints: words the dictionary itself links to that sense (synonyms,
 *   broader terms, parts and wholes, topics, examples), never hand- or
 *   AI-written. A linked word only counts in one of its main senses ("dab" is
 *   a kind of dance, but nobody thinks of dancing when they read it). A word
 *   without MIN_HINTS usable ones is left out.
 * Hand-written lines in scripts/words-source.txt win over generated ones.
 */
const fs = require('fs');
const path = require('path');
const { describe, givesAway, MIN_HINTS } = require('./words-rules');

/** SCOWL size a game word needs: up to 50 = a medium dictionary (35 small, 60 the usual spell checker). */
const MAX_WORD_SIZE = 50;
/** Hints must be words everyone knows: SCOWL's small dictionary. */
const MAX_HINT_SIZE = 35;
const MIN_LENGTH = 3;
const MAX_LENGTH = 15;
const HINTS = 3;

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

/** Too vague to help as a hint ("entity", "act", "make"). */
const VAGUE = new Set(
  `entity thing object whole unit abstraction act action attribute state quality group part matter substance event
  being organism person individual someone somebody artifact artefact instrumentality property relation measure
  location region area activity change cause condition form kind sort type way make do be have get go take give use
  set put cover move one people some content structure device system process idea point example time`.split(/\s+/),
);

/** Function words skipped when a definition's words are used as hints. */
const STOPWORDS = new Set(
  `a an the of or and to in on at by for from with without into onto as is are be been being that which who whom whose
  this these those it its their his her its used usually especially often typically very more most less any all some
  such other another than then also not no can may might will would should one two having has have had something
  someone somebody small large various several many much made make makes way part etc`.split(/\s+/),
);

const BLOCKED_PATH = path.join(__dirname, 'blocked-words.txt');

const readBlocked = () =>
  new Set(
    fs
      .readFileSync(BLOCKED_PATH, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean),
  );

/** Hint relations, most telling first. Each lists the synset ids linked to `s`. */
const HINT_SOURCES = [
  (s) => [s.id], // synonyms
  (s) => s.relations.hypernym ?? [],
  (s) => [...(s.relations.domain_topic ?? []), ...(s.relations.attribute ?? [])],
  (s) => ['mero_part', 'mero_member', 'mero_substance', 'holo_part', 'holo_member', 'holo_substance'].flatMap((r) => s.relations[r] ?? []),
  (s) => ['similar', 'also', 'entails', 'causes'].flatMap((r) => s.relations[r] ?? []),
  (s) => s.relations.hyponym ?? [],
];

/** A main sense is a word's most used one, or any of its next MAIN_SENSES - 1 that was ever tagged in real text. */
const MAIN_SENSES = 3;

/**
 * Builds the generator's checks over the dictionaries. `blocked` is the set of
 * terms that may appear nowhere in a generated word (scripts/blocked-words.txt).
 */
function makeHinter(wn, sizeOf, blocked) {
  const commonSenses = (lemma) => wn.sensesOf(lemma).filter((s) => !s.proper);
  /** `synsetId` is one of `lemma`'s main senses. */
  const isMainSense = (lemma, synsetId) => {
    const senses = commonSenses(lemma);
    const i = senses.findIndex((s) => s.synset === synsetId);
    return i === 0 || (i > 0 && i < MAIN_SENSES && senses[i].count > 0);
  };
  const isNoun = (lemma) => commonSenses(lemma)[0]?.synset.endsWith('-n') ?? false;
  const above = (s) => s.relations.hypernym ?? [];

  /** Up to HINTS hints for `word` meaning `synset`; the description's nouns fill in when the links run short. */
  return { isMainSense, hintsFor };

  function hintsFor(word, synset, description) {
    const hints = [];
    const add = (h) => {
      if (
        hints.length < HINTS &&
        /^[a-z]{2,12}$/.test(h) &&
        sizeOf(h) <= MAX_HINT_SIZE &&
        !VAGUE.has(h) &&
        !blocked.has(h) &&
        !hints.some((other) => givesAway(other, h) || givesAway(h, other)) &&
        !h.includes(word) &&
        !word.includes(h) &&
        !givesAway(word, h) &&
        !givesAway(h, word)
      )
        hints.push(h);
    };
    const addLinked = (id) => {
      for (const h of wn.synset(id)?.lemmas ?? []) if (isMainSense(h, id)) add(h);
    };
    for (const source of HINT_SOURCES) source(synset).forEach(addLinked);
    for (const id of above(synset)) above(wn.synset(id)).forEach(addLinked);
    if (hints.length < MIN_HINTS) for (const t of description.toLowerCase().match(/[a-z]+/g) ?? []) if (!STOPWORDS.has(t) && isNoun(t)) add(t);
    return hints;
  }
}

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
 * The generated words, alphabetical, as `{ word, sense, description, hints, size, concrete }`,
 * and how many candidates each check turned away.
 */
function generateWords(wn, scowl) {
  const blocked = readBlocked();
  const { isMainSense, hintsFor } = makeHinter(wn, scowl.sizeOf, blocked);
  const words = [];
  const rejected = { blocked: 0, offensive: 0, noSense: 0, fewHints: 0 };
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
    for (const { synset: id } of senses) {
      if (!isMainSense(word, id)) break;
      const synset = wn.synset(id);
      if (exemplifies(synset, SKIPPED_USAGE) || SKIPPED_LEXFILES.has(synset.lexfile)) continue;
      const description = describe(word, synset.definition);
      if (!description) continue;
      if ((description.toLowerCase().match(/[a-z]+/g) ?? []).some((t) => blocked.has(t))) {
        reason = 'blocked';
        break;
      }
      const hints = hintsFor(word, synset, description);
      if (hints.length >= MIN_HINTS) {
        best = { word, sense: id, description, hints, size, concrete: CONCRETE_LEXFILES.has(synset.lexfile) };
        break;
      }
      reason = 'fewHints';
    }
    if (best) words.push(best);
    else rejected[reason]++;
  }
  return { words, rejected };
}

module.exports = { generateWords };
