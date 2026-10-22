import {
  buyLetters,
  canBuyLetters,
  clueCount,
  createRound,
  decoyLetters,
  disabledCount,
  edgeLetters,
  guess,
  sceneStage,
  balloonsGone,
  balloonsLeft,
  hiddenLetters,
  keyState,
  pickClueLetters,
  pickDisabledLetters,
  Round,
  roundStatus,
  tileState,
  usedLetters,
  validateWord,
  wrongCount,
} from '../engine';
import { LETTER_FREQUENCY, LONG_WORD_CLUES, LONG_WORD_LENGTH } from '../config';
import { LEVELS } from '../levels';
import { WORDS } from '../words';

const round = (word: string, clues: string[] = [], maxWrong = 10, disabled: string[] = []): Round => ({
  id: 'r1',
  wordId: `en-${word}`,
  word,
  language: 'en',
  description: 'test',
  hints: ['hint'],
  level: 1,
  maxWrong,
  clueLetters: clues,
  disabledLetters: disabled,
  boughtLetters: [],
  guessed: [],
  descriptionUnlocked: false,
});

const play = (r: Round, letters: string) => letters.split('').reduce(guess, r);

describe('word constraints', () => {
  it('accepts 1 to 15 letters, inclusive (Pendu rejected 15)', () => {
    expect(validateWord('a')).toEqual({ ok: true, word: 'a' });
    expect(validateWord('procrastination')).toEqual({ ok: true, word: 'procrastination' });
    expect(validateWord('abcdefghijklmnop')).toEqual({ ok: false, error: 'too_long' });
    expect(validateWord('')).toEqual({ ok: false, error: 'empty' });
  });

  it('accepts only plain A–Z and normalizes case (Pendu accepted accents)', () => {
    expect(validateWord('CaStLe')).toEqual({ ok: true, word: 'castle' });
    for (const bad of ['café', 'ice cream', 'x-ray', 'r2d2', 'naïve', 'straße'])
      expect(validateWord(bad)).toEqual({ ok: false, error: 'not_letters' });
  });
});

describe('clues', () => {
  it('gives at least one clue and always keeps a letter hidden', () => {
    expect(clueCount('cat', 0)).toBe(1);
    expect(clueCount('cat', 1)).toBe(2);
    expect(clueCount('ab', 0.9)).toBe(1);
  });

  it('gives long words at least LONG_WORD_CLUES (4) clues, even on the hardest level', () => {
    expect(LONG_WORD_CLUES).toBe(4);
    const hardest = LEVELS[LEVELS.length - 1];
    for (const w of WORDS.filter((e) => e.word.length >= LONG_WORD_LENGTH))
      // unless a letter must stay hidden: a long word with only 4 distinct letters shows 3
      expect(clueCount(w.word, hardest.clueRatio)).toBeGreaterThanOrEqual(Math.min(LONG_WORD_CLUES, new Set(w.word).size - 1));
    expect(clueCount('skyscraper', 0)).toBe(LONG_WORD_CLUES);
    expect(clueCount('sunflowe', 0)).toBe(LONG_WORD_CLUES);
    expect(clueCount('sunflow', 0)).toBe(1);
    // keeping a letter hidden still wins
    expect(clueCount('aaaaaaab', 0)).toBe(1);
  });

  it('gives longer words more clues', () => {
    expect(clueCount('strawberry', 0.4)).toBeGreaterThan(clueCount('cat', 0.4));
  });

  it('gives no clue to a word with a single distinct letter (hidden letter wins)', () => {
    expect(clueCount('a', 0.5)).toBe(0);
    expect(clueCount('aaa', 0.5)).toBe(0);
  });

  it('reveals every occurrence of a clue letter and marks its key used', () => {
    const r = createRound(
      { id: 'r', wordId: 'w', word: 'hello', language: 'en', description: '', hints: [], level: 1, clueRatio: 0.3 },
      () => 0,
    );
    expect(r.clueLetters).toHaveLength(1);
    const [c] = r.clueLetters;
    expect(tileState(r, c)).toBe('clue');
    expect(keyState(r, c)).toBe('clue');
    expect(usedLetters(r).has(c)).toBe(true);
    expect(roundStatus(r)).toBe('playing');
  });

  it('picks distinct letters from the word', () => {
    const letters = pickClueLetters('strawberry', 0.5);
    expect(new Set(letters).size).toBe(letters.length);
    letters.forEach((c) => expect('strawberry').toContain(c));
  });

  it("starts a long word's clues with its first or last two letters (owner's call)", () => {
    // rng < 0.5 = the front, otherwise the back; each letter shows everywhere it appears
    expect(edgeLetters('reasonable', () => 0)).toEqual(['r', 'e']);
    expect(edgeLetters('reasonable', () => 0.9)).toEqual(['l', 'e']);
    expect(edgeLetters('balloons', () => 0.9)).toEqual(['n', 's']);
    expect(edgeLetters('llamas', () => 0)).toEqual([]); // short words: no edge
    expect(LONG_WORD_LENGTH).toBe(8);
    const clues = pickClueLetters('reasonable', 0, () => 0.9);
    expect(clues).toHaveLength(LONG_WORD_CLUES);
    expect(clues.slice(0, 2)).toEqual(['l', 'e']);
    // a doubled edge letter counts once
    expect(edgeLetters('aardvarks', () => 0)).toEqual(['a']);
    // keeping a letter hidden still wins over the edge
    expect(pickClueLetters('aaaaaaab', 0, () => 0.9)).toEqual(['a']);
  });

  it('can reveal the rarest letters first: the X of "jukebox", not its E', () => {
    const en = LETTER_FREQUENCY.en;
    expect(clueCount('jukebox', 0.3)).toBe(2);
    expect(pickClueLetters('jukebox', 0.3, () => 0, en, 2)).toEqual(['x', 'j']);
    // only the first `rare` clues are the rarest, the rest stay random
    const one = pickClueLetters('jukebox', 0.3, () => 0, en, 1);
    expect(one[0]).toBe('x');
    expect(one).toHaveLength(2);
    // never more than the clue count
    expect(pickClueLetters('jukebox', 0.3, () => 0, en, 5)).toEqual(['x', 'j']);
    // no rare clues: the same random clues as before
    expect(pickClueLetters('jukebox', 0.3, () => 0, en, 0)).toEqual(pickClueLetters('jukebox', 0.3, () => 0));
    // a long word: its edge first, then its rarest letters (the V of "virulent")
    expect(pickClueLetters('virulent', 0.3, () => 0, en, 2)).toEqual(['v', 'i', 'u', 'l']);
  });

  it('gives a round its rarest letters as clues when asked, in its own language', () => {
    const input = { id: 'r', wordId: 'w', word: 'jukebox', language: 'en', description: '', hints: [], level: 13, clueRatio: 0.3 };
    expect(createRound({ ...input, rareClues: 2 }, () => 0).clueLetters).toEqual(['x', 'j']);
    // a language without a letter-frequency row gets random clues
    expect(createRound({ ...input, language: 'xx', rareClues: 2 }, () => 0).clueLetters).toEqual(
      createRound({ ...input, language: 'xx' }, () => 0).clueLetters,
    );
  });
});

describe('disabled keys (easy levels)', () => {
  it('disables a share of the letters not in the word, never one in it', () => {
    expect(decoyLetters('hello')).toHaveLength(22);
    expect(disabledCount('hello', 0.5)).toBe(11);
    expect(disabledCount('hello', 0)).toBe(0);
    for (let seed = 0; seed < 20; seed++) {
      const off = pickDisabledLetters('hello', 0.5, () => (seed * 0.049) % 1);
      expect(new Set(off).size).toBe(11);
      expect(off.some((c) => 'helo'.includes(c))).toBe(false);
    }
  });

  it('always leaves at least one wrong letter to guess', () => {
    expect(disabledCount('hello', 1)).toBe(21);
  });

  it('gives a full keyboard when the level has no ratio', () => {
    const r = createRound({ id: 'r', wordId: 'w', word: 'castle', language: 'en', description: '', hints: [], level: 6, clueRatio: 0.2 });
    expect(r.disabledLetters).toEqual([]);
  });

  it('shows a disabled key as off, counts it as used and refuses it as a guess', () => {
    const r = round('cat', [], 10, ['z', 'q']);
    expect(keyState(r, 'z')).toBe('off');
    expect(usedLetters(r).has('q')).toBe(true);
    expect(guess(r, 'z')).toBe(r);
    expect(wrongCount(play(r, 'zqx'))).toBe(1);
  });
});

describe('turns', () => {
  it('reveals every occurrence of a correct letter', () => {
    const r = play(round('hello'), 'l');
    expect(tileState(r, 'l')).toBe('ok');
    expect(wrongCount(r)).toBe(0);
  });

  it('counts a wrong letter once and shows it as wrong', () => {
    const r = play(round('hello'), 'z');
    expect(wrongCount(r)).toBe(1);
    expect(keyState(r, 'z')).toBe('no');
  });

  it('blocks repeat guesses, even after more than 11 guesses (Pendu used char[11])', () => {
    // A high limit so the round is still playing after 14 wrong guesses
    const r = play(round('quiz', [], 26), 'abcdefghjklmno');
    const before = r.guessed.length;
    expect(guess(r, 'a')).toBe(r);
    expect(guess(r, 'o')).toBe(r);
    expect(r.guessed.length).toBe(before);
  });

  it('ignores a clue letter, uppercase is normalized, and non-letters are ignored', () => {
    const r = round('hello', ['h']);
    expect(guess(r, 'h')).toBe(r);
    expect(guess(r, 'E').guessed).toEqual(['e']);
    expect(guess(r, '1')).toBe(r);
    expect(guess(r, 'é')).toBe(r);
  });
});

describe('win and loss', () => {
  it('wins when every letter is revealed, clues included', () => {
    const r = play(round('hello', ['h']), 'elo');
    expect(roundStatus(r)).toBe('won');
  });

  it('loses exactly at the 10th wrong guess, then locks input (Pendu kept input enabled)', () => {
    let r = play(round('quiz'), 'abcdefghj');
    expect(wrongCount(r)).toBe(9);
    expect(roundStatus(r)).toBe('playing');
    r = guess(r, 'k');
    expect(roundStatus(r)).toBe('lost');
    expect(sceneStage(r)).toBe(10);
    expect(guess(r, 'q')).toBe(r);
  });

  it('locks input once won', () => {
    const r = play(round('ab'), 'ab');
    expect(roundStatus(r)).toBe('won');
    expect(guess(r, 'z')).toBe(r);
  });
});

describe('balloons', () => {
  it('pops one balloon per wrong guess out of 10 at the default limit', () => {
    const r = round('quiz');
    expect(balloonsLeft(r)).toBe(10);
    expect(balloonsGone(play(r, 'abc'))).toBe(3);
    expect(balloonsLeft(play(r, 'abc'))).toBe(7);
  });

  it('starts with one balloon per allowed miss, so each miss still pops exactly one', () => {
    const r = round('quiz', [], 6);
    expect(balloonsLeft(r)).toBe(6);
    expect(balloonsGone(r)).toBe(4);
    expect(balloonsLeft(play(r, 'a'))).toBe(5);
    const lost = play(r, 'abcdef');
    expect(roundStatus(lost)).toBe('lost');
    expect(balloonsLeft(lost)).toBe(0);
  });
});

describe('scene stage', () => {
  it('is one stage per wrong guess at the default limit', () => {
    expect(sceneStage(play(round('quiz'), 'abc'))).toBe(3);
  });

  it('scales with fewer allowed wrong guesses and ends on stage 10', () => {
    const r = round('quiz', [], 6);
    expect(sceneStage(play(r, 'a'))).toBe(2); // round(10/6)
    expect(sceneStage(play(r, 'abc'))).toBe(5);
    const lost = play(r, 'abcdef');
    expect(roundStatus(lost)).toBe('lost');
    expect(sceneStage(lost)).toBe(10);
  });
});

describe('bought letters', () => {
  it('reveals every occurrence of the bought letters, which look and count like clues', () => {
    const r = buyLetters(round('banana', ['b']), 1, () => 0);
    expect(r.boughtLetters).toHaveLength(1);
    const [c] = r.boughtLetters;
    expect('an').toContain(c);
    expect(tileState(r, c)).toBe('clue');
    expect(keyState(r, c)).toBe('clue');
    expect(usedLetters(r).has(c)).toBe(true);
    expect(guess(r, c)).toBe(r);
    expect(wrongCount(r)).toBe(0);
  });

  it('always leaves a letter hidden, so buying never wins the round', () => {
    const r = round('castle', ['c', 'a', 's']);
    expect(hiddenLetters(r)).toHaveLength(3);
    expect(canBuyLetters(r, 2)).toBe(true);
    expect(roundStatus(buyLetters(r, 2))).toBe('playing');
    const twoLeft = play(r, 't');
    expect(canBuyLetters(twoLeft, 2)).toBe(false);
    expect(buyLetters(twoLeft, 2)).toBe(twoLeft);
  });

  it('can be bought once per round, and not once the round is over', () => {
    const r = buyLetters(round('castle'), 2);
    expect(buyLetters(r, 2)).toBe(r);
    const lost = play(round('castle', [], 2), 'zq');
    expect(roundStatus(lost)).toBe('lost');
    expect(buyLetters(lost, 2)).toBe(lost);
  });
});
