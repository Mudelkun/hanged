import { STARTING_TOKENS, WORDS_PER_TOKEN } from '../config';
import { decoyLetters, roundStatus, usedLetters } from '../engine';
import { LEVELS, levelNumberFor } from '../levels';
import { gameReducer, GameState, initialState } from '../progress';
import { pickWord, WORDS } from '../words';

const word = {
  id: 'en-castle',
  word: 'castle',
  language: 'en',
  description: 'A big stone home for a king.',
  hints: ['king', 'tower', 'stone'],
};

const startRound = (s: GameState) => gameReducer(s, { type: 'newRound', word, roundId: 'r', rng: () => 0 });

function winRound(s: GameState): GameState {
  let state = startRound(s);
  for (const c of 'castle') state = gameReducer(state, { type: 'guess', letter: c });
  return state;
}

describe('scoring', () => {
  it('counts a won round once, even if more guesses arrive', () => {
    let s = winRound(initialState());
    expect(roundStatus(s.round!)).toBe('won');
    expect(s.wordsGuessed).toBe(1);
    s = gameReducer(s, { type: 'guess', letter: 'z' });
    expect(s.wordsGuessed).toBe(1);
  });

  it('awards 1 token for every WORDS_PER_TOKEN words guessed', () => {
    let s = initialState();
    for (let i = 0; i < WORDS_PER_TOKEN - 1; i++) s = winRound(s);
    expect(s.tokens).toBe(STARTING_TOKENS);
    expect(s.wordsTowardToken).toBe(WORDS_PER_TOKEN - 1);
    s = winRound(s);
    expect(s.tokens).toBe(STARTING_TOKENS + 1);
    expect(s.wordsTowardToken).toBe(0);
    expect(s.lastTokenEarned).toBe(true);
    expect(startRound(s).lastTokenEarned).toBe(false);
  });

  it('does not score a lost round', () => {
    let s = startRound(initialState());
    const wrong = decoyLetters(word.word).filter((c) => !usedLetters(s.round!).has(c));
    for (const c of wrong.slice(0, s.round!.maxWrong)) s = gameReducer(s, { type: 'guess', letter: c });
    expect(roundStatus(s.round!)).toBe('lost');
    expect(s.wordsGuessed).toBe(0);
  });

  it('pays out progress saved under an older, slower token rate', () => {
    const saved = { ...initialState(), tokens: 5, wordsTowardToken: WORDS_PER_TOKEN * 3 - 1 };
    const s = gameReducer(initialState(), { type: 'hydrate', state: saved });
    expect(s.tokens).toBe(7);
    expect(s.wordsTowardToken).toBe(WORDS_PER_TOKEN - 1);
    const fresh = { ...initialState(), wordsTowardToken: WORDS_PER_TOKEN - 1 };
    expect(gameReducer(initialState(), { type: 'hydrate', state: fresh })).toBe(fresh);
  });
});

describe('hint words', () => {
  it('a new round carries the word hints, for free', () => {
    const s = startRound(initialState());
    expect(s.round!.hints).toEqual(word.hints);
    expect(s.tokens).toBe(STARTING_TOKENS);
  });

  it('a round saved before hints existed gets them from the word database', () => {
    const { hints, ...oldRound } = startRound(initialState()).round!;
    const saved = { ...initialState(), round: oldRound as typeof oldRound & { hints: string[] } };
    expect(gameReducer(initialState(), { type: 'hydrate', state: saved }).round!.hints).toEqual(hints);
  });
});

describe('disabled keys', () => {
  it('disable fewer letters as levels rise, down to a full keyboard', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].disabledRatio).toBeLessThanOrEqual(LEVELS[i - 1].disabledRatio);
    }
    expect(LEVELS[0].disabledRatio).toBeGreaterThan(0);
    expect(LEVELS[LEVELS.length - 1].disabledRatio).toBe(0);
  });

  it('a level 1 round starts with letters not in the word disabled', () => {
    const off = startRound(initialState()).round!.disabledLetters;
    expect(off.length).toBeGreaterThan(0);
    expect(off.some((c) => word.word.includes(c))).toBe(false);
  });

  it('a round saved before disabled keys existed keeps a full keyboard', () => {
    const { disabledLetters, ...oldRound } = startRound(initialState()).round!;
    const saved = { ...initialState(), round: oldRound as typeof oldRound & { disabledLetters: string[] } };
    expect(gameReducer(initialState(), { type: 'hydrate', state: saved }).round!.disabledLetters).toEqual([]);
  });
});

describe('description unlock', () => {
  it('costs one token and never lowers the score', () => {
    let s = startRound({ ...initialState(), wordsGuessed: 7 });
    s = gameReducer(s, { type: 'unlockDescription' });
    expect(s.round!.descriptionUnlocked).toBe(true);
    expect(s.tokens).toBe(STARTING_TOKENS - 1);
    expect(s.wordsGuessed).toBe(7);
    // Unlocking twice is free and does nothing
    expect(gameReducer(s, { type: 'unlockDescription' })).toBe(s);
  });

  it('is refused without tokens', () => {
    const s = startRound({ ...initialState(), tokens: 0 });
    expect(gameReducer(s, { type: 'unlockDescription' })).toBe(s);
  });
});

describe('levels and word picking', () => {
  it('only goes up, and caps at the last level', () => {
    expect(levelNumberFor(0)).toBe(1);
    expect(levelNumberFor(10_000)).toBe(LEVELS.length);
  });

  it('has words for every level, and avoids recent words', () => {
    for (const level of LEVELS) {
      const w = pickWord(level, 'en', [], () => 0.5);
      expect(w.word.length).toBeGreaterThanOrEqual(level.minLength);
      expect(w.word.length).toBeLessThanOrEqual(level.maxLength);
    }
    const level = LEVELS[0];
    const fitting = WORDS.filter((w) => w.word.length >= level.minLength && w.word.length <= level.maxLength);
    const recent = fitting.slice(1).map((w) => w.id);
    expect(pickWord(level, 'en', recent, Math.random).id).toBe(fitting[0].id);
  });

  it('remembers recent words for the next pick', () => {
    const s = startRound(initialState());
    expect(s.recentWordIds[0]).toBe('en-castle');
  });
});
