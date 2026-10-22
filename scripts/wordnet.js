/*
 * Open English WordNet (https://en-word.net), the dictionary the word
 * descriptions and generated hints come from. CC BY 4.0: the app must credit
 * it (data/CREDITS.md). Senses are ordered by how often they were tagged in
 * real text, from Princeton WordNet 3.0's cntlist (only the build reads it).
 */
const fs = require('fs');
const zlib = require('zlib');
const { cached, untar } = require('./download');

const EDITION = '2025';
const OEWN_URL = `https://github.com/globalwordnet/english-wordnet/releases/download/${EDITION}-edition/english-wordnet-${EDITION}.xml.gz`;
const PWN_URL = 'https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz';
const CNTLIST = 'WordNet-3.0/dict/cntlist.rev';

const unescape = (s) =>
  s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** "oewn-castle__1.06.00.." → "castle%1:06:00::", the Princeton sense key it continues. */
const pwnKey = (senseId) => senseId.replace(/^oewn-/, '').replace('__', '%').replace(/\./g, ':');

/**
 * lemma (lowercase) → its senses, and synset id → { id, pos, lexfile, definition,
 * lemmas, relations }. A sense is { synset, key, proper }: `proper` when the
 * entry is capitalised ("Bill", "Turkey"), i.e. a name rather than a word.
 */
function parse(xml) {
  const senses = new Map();
  const synsets = new Map();
  const lemmaOf = new Map();
  let entry = null;
  let lemma = null;
  let proper = false;
  let synset = null;
  for (const line of xml.split('\n')) {
    let m;
    if ((m = line.match(/<LexicalEntry id="([^"]+)"/))) {
      entry = m[1];
      lemma = null;
      synset = null;
    } else if (entry && (m = line.match(/<Lemma writtenForm="([^"]+)"/))) {
      const written = unescape(m[1]);
      lemma = written.toLowerCase();
      proper = written !== lemma;
      lemmaOf.set(entry, lemma);
    } else if (lemma && (m = line.match(/<Sense id="([^"]+)"[^>]*synset="oewn-([^"]+)"/))) {
      if (!senses.has(lemma)) senses.set(lemma, []);
      senses.get(lemma).push({ synset: m[2], key: pwnKey(m[1]), proper });
    } else if ((m = line.match(/<Synset id="oewn-([^"]+)"[^>]*members="([^"]+)" partOfSpeech="(\w)"(?: lexfile="([^"]+)")?/))) {
      entry = null;
      lemma = null;
      synset = { id: m[1], pos: m[3], lexfile: m[4] ?? '', members: m[2].split(' '), definition: '', relations: {} };
      synsets.set(synset.id, synset);
    } else if (synset && (m = line.match(/<Definition>(.*)<\/Definition>/))) {
      synset.definition = unescape(m[1]);
    } else if (synset && (m = line.match(/<SynsetRelation relType="(\w+)" target="oewn-([^"]+)"/))) {
      (synset.relations[m[1]] ??= []).push(m[2]);
    }
  }
  for (const s of synsets.values()) s.lemmas = s.members.map((id) => lemmaOf.get(id) ?? '');
  return { senses, synsets };
}

/** Princeton sense key → times it was tagged in the Semantic Concordance. */
function parseCounts(text) {
  const counts = new Map();
  for (const line of text.split('\n')) {
    const [key, , count] = line.trim().split(' ');
    if (key && count) counts.set(key, Number(count));
  }
  return counts;
}

/** Loads the dictionary, downloading it the first time. */
async function loadWordNet() {
  const xmlFile = await cached(`english-wordnet-${EDITION}.xml.gz`, OEWN_URL, `Open English WordNet ${EDITION}`);
  const pwnFile = await cached('WordNet-3.0.tar.gz', PWN_URL, 'Princeton WordNet 3.0 (sense counts)');
  const cntlist = untar(pwnFile, (name) => name === CNTLIST).get(CNTLIST);
  if (!cntlist) throw new Error(`${CNTLIST} missing from ${PWN_URL}`);
  const { senses, synsets } = parse(zlib.gunzipSync(fs.readFileSync(xmlFile)).toString('utf8'));
  const counts = parseCounts(cntlist.toString('utf8'));
  for (const list of senses.values()) {
    for (const s of list) s.count = counts.get(s.key) ?? 0;
    list.sort((a, b) => b.count - a.count);
  }
  return {
    edition: EDITION,
    synset: (id) => synsets.get(id),
    /** A lemma's senses, most used first: { synset, key, proper, count }. */
    sensesOf: (lemma) => senses.get(lemma.toLowerCase()) ?? [],
    lemmas: () => senses.keys(),
  };
}

module.exports = { loadWordNet };
