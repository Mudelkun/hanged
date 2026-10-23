import { LETTER_FREQUENCY } from '../config';
import { buyLetters, createRound, guess, hiddenLetters, keyState, Round, roundStatus, tileState, usedLetters, validateWord, wrongCount } from '../engine';
import { alphabetFor, guessWord, KEYBOARD_ROWS, LANGUAGES, languageForLocales } from '../languages';
import { LEVELS } from '../levels';
import { checkName, namesForLanguage } from '../names';
import { gameReducer, initialState, nextWord } from '../progress';
import { levelPool, pickWord, seenWord, wordById, wordsForLanguage } from '../words';
import { TRANSLATIONS } from '../../i18n';

const rngFor = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const roundFor = (word: string, language: string, toFind = 5) => createRound({
  id: 'test', wordId: `${language}-${word}`, word, language, description: 'clue', level: 8, toFind,
}, () => 0.5);

test('regional device preferences resolve in order and unsupported languages fall back to English', () => {
  expect(languageForLocales(['fr-CA', 'en-US'])).toBe('fr');
  expect(languageForLocales(['ja-JP', 'es-MX', 'de-DE'])).toBe('es');
  expect(languageForLocales(['DE_de'])).toBe('de');
  expect(languageForLocales(['zh-CN'])).toBe('en');
  expect(languageForLocales([])).toBe('en');
});

test.each(LANGUAGES)('$id has complete strings, matching placeholders, subjects and safe generated names', ({ id }) => {
  const base = TRANSLATIONS.en, translated = TRANSLATIONS[id];
  expect(Object.keys(translated).sort()).toEqual(Object.keys(base).sort());
  const placeholders = (s: string) => [...s.matchAll(/\{\w+\}/g)].map(m => m[0]).sort();
  for (const key of Object.keys(base) as (keyof typeof base)[]) {
    expect(translated[key].length).toBeGreaterThan(0);
    expect(placeholders(translated[key])).toEqual(placeholders(base[key]));
  }
  for (const name of namesForLanguage(id)) expect({ name, valid: checkName(name).ok }).toEqual({ name, valid: true });
});

test.each(['fr', 'es', 'de'])('%s pack has valid unique words, short clues without the answer, and solvable rounds', language => {
  const words = wordsForLanguage(language);
  expect(words.length).toBeGreaterThanOrEqual(400);
  expect(new Set(words.map(w => w.id)).size).toBe(words.length);
  const alphabet = alphabetFor(language);
  expect(new Set(KEYBOARD_ROWS[language as 'fr'].join(''))).toEqual(new Set(alphabet));
  expect(new Set(LETTER_FREQUENCY[language])).toEqual(new Set(alphabet));
  for (const w of words) {
    expect(w.language).toBe(language);
    expect(validateWord(w.word, language).ok).toBe(true);
    expect(wordById(w.id)).toBe(w);
    expect(w.description.length).toBeLessThanOrEqual(140);
    expect(TRANSLATIONS[language][`subjects.${w.subject}` as keyof typeof TRANSLATIONS.en]).toBeTruthy();
    const answer = guessWord(w.word, language);
    const tokens = w.description.toLowerCase().match(/\p{L}+/gu) ?? [];
    expect(tokens.some(token => guessWord(token, language) === answer)).toBe(false);
    let round = roundFor(w.word, language);
    expect(roundStatus(round)).toBe('playing');
    expect(round.clueLetters.length).toBeGreaterThan(0);
    for (const letter of hiddenLetters(round)) {
      expect(alphabet).toContain(letter);
      round = guess(round, letter);
    }
    expect(roundStatus(round)).toBe('won');
    expect(wrongCount(round)).toBe(0);
  }
});

test('accents preserve spelling, share a key, and never create duplicate guesses', () => {
  let round: Round = { ...roundFor('été', 'fr'), clueLetters: [] };
  round = guess(round, 'É');
  expect(round.word).toBe('été');
  expect(tileState(round, 'é')).toBe('ok');
  expect(keyState(round, 'e')).toBe('ok');
  expect(guess(round, 'e')).toBe(round);
  expect(guess(round, 'e\u0301')).toBe(round);
  expect(wrongCount(round)).toBe(0);
  expect(roundStatus(guess(round, 't'))).toBe('won');
  expect(validateWord('ÉTÉ', 'fr')).toEqual({ ok: true, word: 'été' });
  expect(validateWord('été', 'en').ok).toBe(false);
  expect(validateWord('niño', 'fr').ok).toBe(false);
});

test('Ñ, ß and Œ have distinct usable keys; German umlauts share base-letter keys', () => {
  for (const [word, language, distinct, wrong] of [['niño', 'es', 'ñ', 'x'], ['straße', 'de', 'ß', 'x'], ['sœur', 'fr', 'œ', 'x']]) {
    const round = { ...roundFor(word, language), clueLetters: [] };
    expect(keyState(guess(round, distinct), distinct)).toBe('ok');
    expect(wrongCount(guess(round, wrong))).toBe(1);
  }
  const boy = { ...roundFor('niño', 'es'), clueLetters: [] };
  expect(tileState(guess(boy, 'n'), 'ñ')).toBe('hidden');
  expect(tileState(guess(boy, 'ñ'), 'n')).toBe('hidden');
  const bear = { ...roundFor('bär', 'de'), clueLetters: [] };
  expect(tileState(guess(bear, 'a'), 'ä')).toBe('ok');
  expect(wrongCount(guess(bear, 'a'))).toBe(0);
});

test('bought letters, clues and disabled keys follow normalized keys in every language', () => {
  for (const [word, language] of [['réfrigérateur', 'fr'], ['cumpleaños', 'es'], ['kühlschrank', 'de']]) {
    const round = createRound({ ...roundFor(word, language), id: 'x', toFind: 5, disabledRatio: .5 });
    const target = guessWord(word, language);
    for (const c of round.disabledLetters) expect(target).not.toContain(c);
    for (const c of round.clueLetters) {
      for (const display of [...word].filter(letter => guessWord(letter, language) === c)) expect(tileState(round, display)).toBe('clue');
    }
    const bought = buyLetters(round, 2, () => 0);
    expect(bought.boughtLetters).toHaveLength(2);
    expect(roundStatus(bought)).toBe('playing');
    expect(buyLetters(bought, 2)).toBe(bought);
  }
});

test('switching languages preserves a paid unfinished round through storage and never pays twice', () => {
  let state = { ...initialState('fr'), tokens: 100, levelProgress: { level: 8, wins: 2, losses: 0, rounds: 2 } };
  state = gameReducer(state, { type: 'newRound', word: wordById('fr-réfrigérateur')!, roundId: 'fr1', rng: () => .5 });
  state = gameReducer(state, { type: 'buyLetters', rng: () => 0 });
  state = gameReducer(state, { type: 'guess', letter: 'x', at: 1 });
  const original = state.round!;
  const tokens = state.tokens;
  state = gameReducer(state, { type: 'language', language: 'es', roundId: 'es1', rng: () => 0 });
  expect(state.round?.language).toBe('es');
  expect(state.tokens).toBe(tokens);
  state = gameReducer(initialState(), { type: 'hydrate', state: JSON.parse(JSON.stringify(state)) });
  state = gameReducer(state, { type: 'language', language: 'fr', roundId: 'fr2' });
  expect(state.round).toEqual(original);
  for (const letter of hiddenLetters(state.round!)) state = gameReducer(state, { type: 'guess', letter, at: 2 });
  expect(state.wordsGuessed).toBe(1);
  expect(state.reports).toHaveLength(1);
  const earned = state.tokens;
  state = gameReducer(state, { type: 'guess', letter: 'r', at: 3 });
  expect(state.tokens).toBe(earned);
  state = gameReducer(state, { type: 'language', language: 'es', roundId: 'es2' });
  state = gameReducer(state, { type: 'language', language: 'fr', roundId: 'fr3' });
  expect(state.round?.id).toBe('fr3');
  expect(state.tokens).toBe(earned);
  expect(state.wordsGuessed).toBe(1);
  expect(state.reports[0].wordId).toBe('fr-réfrigérateur');
});

test('legacy English saves stay English; invalid language settings recover without losing progress', () => {
  const old = { ...initialState(), tokens: 81, wordsGuessed: 23 };
  delete (old as Partial<typeof old>).pausedRounds;
  const hydrated = gameReducer(initialState('de'), { type: 'hydrate', state: old });
  expect(hydrated.language).toBe('en');
  expect(hydrated.tokens).toBe(81);
  expect(hydrated.wordsGuessed).toBe(23);
  expect(hydrated.pausedRounds).toEqual({});
  expect(gameReducer(hydrated, { type: 'language', language: 'xx', roundId: 'x' })).toBe(hydrated);
  const recovered = gameReducer(initialState(), { type: 'hydrate', state: { ...old, language: 'xx' } });
  expect(nextWord(recovered).language).toBe('en');
  expect(recovered.tokens).toBe(81);
});

test.each(['fr', 'es', 'de'])('%s has strict pools at every level, no repeats within a cycle, and playable difficulty', language => {
  const rates: number[] = [];
  for (const level of LEVELS) {
    const pool = levelPool(level, language);
    expect(pool.length).toBeGreaterThanOrEqual(30);
    for (const word of pool) {
      expect(word.word.length).toBeGreaterThanOrEqual(level.minLength);
      expect(word.word.length).toBeLessThanOrEqual(level.maxLength);
      expect(word.rarity).toBeLessThanOrEqual(level.maxRarity);
      expect(word.difficulty).toBeLessThanOrEqual(level.maxDifficulty);
      if (level.concreteOnly) expect(word.concrete).toBe(true);
    }
    const rng = rngFor(level.level);
    let won = 0;
    for (let i = 0; i < 400; i++) {
      const w = pool[Math.floor(rng() * pool.length)];
      let round = createRound({ ...w, id: 'r', wordId: w.id, level: level.level, toFind: level.toFind,
        maxWrong: level.maxWrong, disabledRatio: level.disabledRatio }, rng);
      for (const letter of LETTER_FREQUENCY[language]) if (!usedLetters(round).has(letter)) round = guess(round, letter);
      if (roundStatus(round) === 'won') won++;
    }
    rates.push(won / 4);
    expect(won / 400).toBeGreaterThanOrEqual(level.level <= 15 ? .70 : .5);
  }
  console.log(language, 'win rates by level (%):', rates.join(', '));
  let seen: string[] = [];
  const pool = levelPool(LEVELS[0], language);
  for (let i = 0; i < pool.length; i++) {
    const word = pickWord(LEVELS[0], language, seen, () => 0);
    expect(seen).not.toContain(word.id);
    seen = seenWord(seen, word, LEVELS[0]);
  }
  expect(pickWord(LEVELS[0], language, seen, () => .999).id).not.toBe(seen[seen.length - 1]);
});
