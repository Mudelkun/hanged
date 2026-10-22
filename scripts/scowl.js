/*
 * SCOWL (Spell Checker Oriented Word Lists, http://wordlist.aspell.net) by
 * Kevin Atkinson: how common each English word is. Its size levels go from 10
 * (the most common words) to 95 (the most obscure); 50 is a medium dictionary.
 * Permissive licence, credited in data/CREDITS.md. Only the build reads it.
 */
const { cached, untar } = require('./download');

const RELEASE = '2020.12.07';
const URL = `https://downloads.sourceforge.net/wordlist/scowl-${RELEASE}.tar.gz`;
/**
 * Words common to every spelling plus the American ones, without names,
 * abbreviations or variants: one spelling per word, so "color" never comes
 * back as "colour".
 */
const LIST = new RegExp(`^scowl-${RELEASE.replace(/\./g, '\\.')}/final/(english|american)-words\\.(\\d+)$`);

/** Loads word (a–z only) → its smallest SCOWL size, downloading the lists the first time. */
async function loadScowl() {
  const file = await cached(`scowl-${RELEASE}.tar.gz`, URL, `SCOWL ${RELEASE}`);
  const sizes = new Map();
  for (const [name, data] of untar(file, (n) => LIST.test(n))) {
    const size = Number(name.match(LIST)[2]);
    for (const word of data.toString('latin1').split('\n')) {
      if (/^[a-z]+$/.test(word) && !(sizes.get(word) <= size)) sizes.set(word, size);
    }
  }
  return { release: RELEASE, sizeOf: (word) => sizes.get(word) };
}

module.exports = { loadScowl };
