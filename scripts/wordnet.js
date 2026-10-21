/*
 * Open English WordNet (https://en-word.net), the dictionary the word
 * descriptions come from. CC BY 4.0: the app must credit it (data/CREDITS.md).
 * The release is downloaded once into scripts/.cache/ (gitignored); only the
 * build reads it, never the app.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const EDITION = '2025';
const URL = `https://github.com/globalwordnet/english-wordnet/releases/download/${EDITION}-edition/english-wordnet-${EDITION}.xml.gz`;
const CACHE = path.join(__dirname, '.cache', `english-wordnet-${EDITION}.xml.gz`);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(res.headers.location, dest));
        }
        if (res.statusCode !== 200) return reject(new Error(`WordNet download failed: HTTP ${res.statusCode}`));
        const tmp = `${dest}.part`;
        res.pipe(fs.createWriteStream(tmp)).on('finish', () => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      })
      .on('error', reject);
  });
}

const unescape = (s) =>
  s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Lemma (lowercase) → its synset ids in dictionary order, and synset id → { pos, definition, lemmas }. */
function parse(xml) {
  const senses = new Map();
  const synsets = new Map();
  const lemmaOf = new Map();
  let entry = null;
  let lemma = null;
  let synset = null;
  for (const line of xml.split('\n')) {
    let m;
    if ((m = line.match(/<LexicalEntry id="([^"]+)"/))) {
      entry = m[1];
      lemma = null;
      synset = null;
    } else if (entry && (m = line.match(/<Lemma writtenForm="([^"]+)"/))) {
      lemma = unescape(m[1]).toLowerCase();
      lemmaOf.set(entry, lemma);
    } else if (lemma && (m = line.match(/<Sense [^>]*synset="oewn-([^"]+)"/))) {
      if (!senses.has(lemma)) senses.set(lemma, []);
      senses.get(lemma).push(m[1]);
    } else if ((m = line.match(/<Synset id="oewn-([^"]+)"[^>]*members="([^"]+)" partOfSpeech="(\w)"/))) {
      synset = { id: m[1], pos: m[3], members: m[2].split(' '), definition: '' };
      synsets.set(synset.id, synset);
    } else if (synset && (m = line.match(/<Definition>(.*)<\/Definition>/))) {
      synset.definition = unescape(m[1]);
    }
  }
  for (const s of synsets.values()) s.lemmas = s.members.map((id) => lemmaOf.get(id) ?? '');
  return { senses, synsets };
}

/** Loads the dictionary, downloading it the first time. */
async function loadWordNet() {
  if (!fs.existsSync(CACHE)) {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    console.log(`Downloading Open English WordNet ${EDITION}…`);
    await download(URL, CACHE);
  }
  const { senses, synsets } = parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString('utf8'));
  return {
    edition: EDITION,
    synset: (id) => synsets.get(id),
    /** Every sense of a lemma, in dictionary order. */
    sensesOf: (lemma) => (senses.get(lemma.toLowerCase()) ?? []).map((id) => synsets.get(id)),
  };
}

module.exports = { loadWordNet };
