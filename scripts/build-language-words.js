/* Original, curated language packs. English keeps its existing dictionary pipeline.
 * Source: data/words/<language>.txt. Build: node scripts/build-language-words.js
 * Each line: word | original clue | subject | optional rarity (default 20).
 * Metadata measures the same word-matching model as English, using each language's keys.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
// Run the actual shared key normalization, without maintaining a second accent implementation.
function readTS(file) {
  const filename = path.resolve(file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(ts.transpile(fs.readFileSync(filename, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), filename);
  return mod.exports;
}
const { guessWord, hasValidLetters } = readTS('src/game/languages.ts');
const { LETTER_FREQUENCY } = readTS('src/game/config.ts');
const { measureDifficulty } = require('./difficulty');
for (const language of ['fr', 'es', 'de']) {
  const file = path.join('data', 'words', language);
  const words = fs.readFileSync(file + '.txt', 'utf8').split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).map(line => {
    const [word, description, subject, rarity = '20'] = line.split('|').map(x => x.trim());
    if (!hasValidLetters(word, language) || word.length < 3 || word.length > 15 || !description || description.length > 140 || !subject)
      throw Error('Invalid entry: ' + line);
    const folded = guessWord(word, language);
    if (new Set(folded).size < 2) throw Error('Not enough distinct keys: ' + word);
    if (description.toLowerCase().match(/\p{L}+/gu).some(token => guessWord(token, language) === folded))
      throw Error('Clue contains answer: ' + line);
    return { id: `${language}-${word}`, word, language, description, sense: `hanged-original:${language}-${word}`, rarity: Number(rarity),
      concrete: ['animal', 'food', 'plant', 'object', 'person', 'place', 'body', 'material', 'nature'].includes(subject), subject };
  });
  if (new Set(words.map(w => w.id)).size !== words.length) throw Error('Duplicate word: ' + language);
  const difficulty = measureDifficulty(words.map(w => ({ ...w, word: guessWord(w.word, language) })), LETTER_FREQUENCY[language]);
  const output = words.map(w => ({ ...w, difficulty: difficulty.get(guessWord(w.word, language)) }));
  fs.writeFileSync(file + '.json', '[\n' + output.map(w => JSON.stringify(w)).join(',\n') + '\n]\n');
  console.log(`${language}: ${words.length} words`);
}
