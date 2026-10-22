/*
 * The rules every word in data/words.json follows, shared by the builder and
 * checker (check-words.js) and the generator (auto-words.js).
 */
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
 * clauses that give the word away, then trailing clauses until it fits the card,
 * and a dangling ":" or "," before the full stop.
 * null when nothing usable is left.
 */
function describe(word, definition) {
  let clauses = definition
    .replace(/^(\([^)]*\)\s*)+/, '')
    .split(/;\s*/)
    .map((c) => c.trim())
    .filter((c) => c && !revealsWord(word, c));
  while (clauses.length > 1 && clauses.join('; ').length + 1 > MAX_DESCRIPTION_LENGTH) clauses = clauses.slice(0, -1);
  const text = clauses.join('; ').replace(/[\s:;,]+$/, '');
  if (!text || text.length + 1 > MAX_DESCRIPTION_LENGTH) return null;
  return text[0].toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? '' : '.');
}

/**
 * A word's subject, the free help shown on hard levels: its WordNet category
 * (lexfile), grouped into broad subjects a player understands. A key, not
 * text: the label lives in the app's translations (subjects.<key>), so every
 * language shares the same subjects. WordNet has precise subjects ("chemistry")
 * for only 4% of words, so the broad category is what every word can have.
 */
const SUBJECT_OF_LEXFILE = {
  'noun.animal': 'animal',
  'noun.food': 'food',
  'verb.consumption': 'food',
  'noun.plant': 'plant',
  'noun.body': 'body',
  'verb.body': 'body',
  'noun.artifact': 'object',
  'noun.substance': 'material',
  'noun.object': 'nature',
  'noun.phenomenon': 'nature',
  'verb.weather': 'nature',
  'noun.person': 'person',
  'noun.group': 'group',
  'noun.location': 'place',
  'noun.time': 'time',
  'noun.event': 'event',
  'noun.process': 'event',
  'noun.act': 'action',
  'noun.communication': 'language',
  'verb.communication': 'language',
  'noun.attribute': 'quality',
  'noun.state': 'state',
  'noun.cognition': 'mind',
  'noun.motive': 'mind',
  'verb.cognition': 'mind',
  'noun.feeling': 'feeling',
  'verb.emotion': 'feeling',
  'noun.possession': 'money',
  'verb.possession': 'money',
  'noun.quantity': 'amount',
  'noun.shape': 'shape',
  'noun.relation': 'relation',
  'verb.motion': 'movement',
  'verb.perception': 'senses',
  'verb.competition': 'competition',
  'adv.all': 'manner',
};
/** Every subject key, for the checker. Verbs not listed are actions; adjectives describe. */
const SUBJECTS = [...new Set([...Object.values(SUBJECT_OF_LEXFILE), 'action', 'describing'])];

const subjectOf = (lexfile) =>
  SUBJECT_OF_LEXFILE[lexfile] ?? (lexfile.startsWith('verb.') ? 'action' : lexfile.startsWith('adj.') ? 'describing' : 'object');

module.exports = { MIN_HINTS, MAX_HINTS, MAX_DESCRIPTION_LENGTH, SUBJECTS, givesAway, revealsWord, describe, subjectOf };
