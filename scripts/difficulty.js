/*
 * How hard each word is to guess in hangman, measured rather than guessed:
 * the misses a typical player makes on it, with no clues and no miss limit.
 *
 * The player knows the everyday words (rarity <= KNOWN_RARITY): each turn it
 * keeps the ones that fit what it sees and picks the letter most of them
 * share. When none fit (a word outside its everyday vocabulary, like
 * "magnesium"), it tries the most frequent English letters, the way people do.
 * Commonness alone misses this: "zebra" and "virulent" are both rarity 35, but
 * virulent costs 11 misses (V, N) and castle 1.
 */
/** The words the typical player thinks of: SCOWL's 10 and 20, about the 10,000 most common. */
const KNOWN_RARITY = 20;
const LETTER_FREQUENCY = 'etaoinshrdlucmfwypvbgkjqxz';

/** Misses playing `word`, given the player's words of the same length. */
function missesFor(word, known, frequency) {
  const used = new Set();
  let misses = 0;
  let left = new Set(word).size;
  let candidates = known;
  while (left > 0) {
    candidates = candidates.filter((w) => {
      for (let i = 0; i < w.length; i++) if (used.has(word[i]) ? w[i] !== word[i] : used.has(w[i])) return false;
      return true;
    });
    const shared = {};
    for (const w of candidates) for (const c of new Set(w)) if (!used.has(c)) shared[c] = (shared[c] || 0) + 1;
    let pick = null;
    for (const c of frequency) if (!used.has(c) && (pick === null || (shared[c] || 0) > (shared[pick] || 0))) pick = c;
    used.add(pick);
    if (word.includes(pick)) left--;
    else misses++;
  }
  return misses;
}

/** word → misses, for every entry of `words` ({ word, rarity }). */
function measureDifficulty(words, frequency = LETTER_FREQUENCY) {
  const known = new Map();
  for (const { word, rarity } of words) if (rarity <= KNOWN_RARITY) (known.get(word.length) ?? known.set(word.length, []).get(word.length)).push(word);
  return new Map(words.map(({ word }) => [word, missesFor(word, known.get(word.length) ?? [], frequency)]));
}

module.exports = { measureDifficulty };
