import { DESCRIPTION_COST, STARTING_TOKENS, STREAK_BONUS_AT, WORDS_PER_LEVEL } from '../config';
import { decoyLetters, roundStatus, usedLetters } from '../engine';
import { LEVELS, levelNumberFor } from '../levels';
import { gameReducer, GameState, initialState, tokenReward } from '../progress';
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

  it('pays tokens on the winning guess, and the next round clears the badge', () => {
    const s = winRound(initialState());
    expect(s.tokens).toBe(STARTING_TOKENS + 1);
    expect(s.lastTokensEarned).toBe(1);
    expect(startRound(s).lastTokensEarned).toBe(0);
  });

  it('does not score a lost round', () => {
    let s = startRound(initialState());
    const wrong = decoyLetters(word.word).filter((c) => !usedLetters(s.round!).has(c));
    for (const c of wrong.slice(0, s.round!.maxWrong)) s = gameReducer(s, { type: 'guess', letter: c });
    expect(roundStatus(s.round!)).toBe('lost');
    expect(s.wordsGuessed).toBe(0);
  });

  it('pays out progress saved under the old "words per token" rate', () => {
    const saved = { ...initialState(), tokens: 5, wordsTowardToken: 1, lastTokenEarned: true };
    const s = gameReducer(initialState(), { type: 'hydrate', state: saved });
    expect(s.tokens).toBe(6);
    expect(s.lastTokensEarned).toBe(1);
    expect('wordsTowardToken' in s || 'lastTokenEarned' in s).toBe(false);
    const fresh = initialState();
    expect(gameReducer(initialState(), { type: 'hydrate', state: fresh })).toBe(fresh);
  });
});

describe('win streak', () => {
  function loseRound(s: GameState): GameState {
    let state = startRound(s);
    const wrong = decoyLetters(word.word).filter((c) => !usedLetters(state.round!).has(c));
    for (const c of wrong.slice(0, state.round!.maxWrong)) state = gameReducer(state, { type: 'guess', letter: c });
    return state;
  }

  const base = LEVELS[0].tokenReward;

  it('pays the level reward, plus +1 at each streak step', () => {
    let s = initialState();
    for (let n = 1; n <= STREAK_BONUS_AT[STREAK_BONUS_AT.length - 1]; n++) {
      const before = s.tokens;
      s = winRound(s);
      const bonus = STREAK_BONUS_AT.filter((k) => n >= k).length;
      expect(s.streak).toBe(n);
      expect(s.lastTokensEarned).toBe(base + bonus);
      expect(s.tokens).toBe(before + base + bonus);
    }
  });

  it('a lost round resets the streak, so the next win pays no bonus', () => {
    let s = initialState();
    for (let i = 0; i < STREAK_BONUS_AT[0]; i++) s = winRound(s);
    s = loseRound(s);
    expect(roundStatus(s.round!)).toBe('lost');
    expect(s.streak).toBe(0);
    s = winRound(s);
    expect(s.lastTokensEarned).toBe(base);
  });

  it('the streak bonus stops growing after the last step', () => {
    expect(tokenReward(1, 10_000)).toBe(base + STREAK_BONUS_AT.length);
  });

  it('harder levels never pay less, and the hardest pays more than the easiest', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].tokenReward).toBeGreaterThanOrEqual(LEVELS[i - 1].tokenReward);
    }
    expect(LEVELS[LEVELS.length - 1].tokenReward).toBeGreaterThan(base);
  });

  it("pays the round's level, not the level the win moves up to", () => {
    const top = LEVELS[LEVELS.length - 1];
    let s = winRound({ ...initialState(), wordsGuessed: WORDS_PER_LEVEL - 1 });
    expect(s.round!.level).toBe(1);
    expect(levelNumberFor(s.wordsGuessed)).toBe(2);
    expect(s.lastTokensEarned).toBe(base);
    s = winRound({ ...initialState(), wordsGuessed: WORDS_PER_LEVEL * LEVELS.length });
    expect(s.round!.level).toBe(top.level);
    expect(s.lastTokensEarned).toBe(top.tokenReward);
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
  it('costs DESCRIPTION_COST tokens and never lowers the score', () => {
    let s = startRound({ ...initialState(), wordsGuessed: 7 });
    s = gameReducer(s, { type: 'unlockDescription' });
    expect(s.round!.descriptionUnlocked).toBe(true);
    expect(s.tokens).toBe(STARTING_TOKENS - DESCRIPTION_COST);
    expect(s.wordsGuessed).toBe(7);
    // Unlocking twice is free and does nothing
    expect(gameReducer(s, { type: 'unlockDescription' })).toBe(s);
  });

  it('is refused without enough tokens', () => {
    const s = startRound({ ...initialState(), tokens: DESCRIPTION_COST - 1 });
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
