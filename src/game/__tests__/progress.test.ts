import {
  DESCRIPTION_COST,
  LETTER_BUY_COST,
  LETTER_BUY_COUNT,
  LEVEL_GRACE_ROUNDS,
  LOSSES_TO_DROP,
  STARTING_TOKENS,
  STREAK_BONUS_AT,
  WORDS_PER_LEVEL,
} from '../config';
import { decoyLetters, roundStatus, usedLetters } from '../engine';
import { afterRound, LEVELS, LevelProgress, START_LEVEL } from '../levels';
import { gameReducer, GameState, initialState, lettersForSale, tokenReward } from '../progress';
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

function loseRound(s: GameState): GameState {
  let state = startRound(s);
  const wrong = decoyLetters(word.word).filter((c) => !usedLetters(state.round!).has(c));
  for (const c of wrong.slice(0, state.round!.maxWrong)) state = gameReducer(state, { type: 'guess', letter: c });
  return state;
}

/** A player on `level`, past the grace, with `extra` overrides on the progress. */
const atLevel = (level: number, extra: Partial<LevelProgress> = {}): GameState => ({
  ...initialState(),
  levelProgress: { ...START_LEVEL, level, rounds: LEVEL_GRACE_ROUNDS, ...extra },
});

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
    const s = loseRound(initialState());
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
    let s = winRound(atLevel(1, { wins: WORDS_PER_LEVEL - 1 }));
    expect(s.round!.level).toBe(1);
    expect(s.levelProgress.level).toBe(2);
    expect(s.lastTokensEarned).toBe(base);
    s = winRound(atLevel(top.level));
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

describe('buying letters', () => {
  const lastLevel = { ...atLevel(LEVELS.length), tokens: LETTER_BUY_COST };

  it('only the levels that sell letters offer them', () => {
    expect(LEVELS[LEVELS.length - 1].sellsLetters).toBe(true);
    expect(lettersForSale(startRound(lastLevel))).toBe(true);
    const easy = startRound({ ...initialState(), tokens: LETTER_BUY_COST });
    expect(lettersForSale(easy)).toBe(false);
    expect(gameReducer(easy, { type: 'buyLetters' })).toBe(easy);
  });

  it('costs LETTER_BUY_COST tokens for LETTER_BUY_COUNT letters, once per round, and never scores', () => {
    let s = startRound(lastLevel);
    s = gameReducer(s, { type: 'buyLetters', rng: () => 0 });
    expect(s.round!.boughtLetters).toHaveLength(LETTER_BUY_COUNT);
    expect(s.tokens).toBe(0);
    expect(s.wordsGuessed).toBe(lastLevel.wordsGuessed);
    expect(roundStatus(s.round!)).toBe('playing');
    expect(gameReducer({ ...s, tokens: LETTER_BUY_COST }, { type: 'buyLetters' }).round).toBe(s.round);
  });

  it('is refused without enough tokens', () => {
    const s = startRound({ ...lastLevel, tokens: LETTER_BUY_COST - 1 });
    expect(gameReducer(s, { type: 'buyLetters' })).toBe(s);
  });

  it('a round saved before bought letters existed has none', () => {
    const { boughtLetters, ...oldRound } = startRound(initialState()).round!;
    const saved = { ...initialState(), round: oldRound as typeof oldRound & { boughtLetters: string[] } };
    expect(gameReducer(initialState(), { type: 'hydrate', state: saved }).round!.boughtLetters).toEqual([]);
  });
});

describe('moving up and down levels', () => {
  const loseTimes = (s: GameState, n: number) => Array.from({ length: n }).reduce<GameState>(loseRound, s);

  it(`moves up after ${WORDS_PER_LEVEL} words guessed on a level, and caps at the last level`, () => {
    let s = initialState();
    for (let i = 1; i < WORDS_PER_LEVEL; i++) s = winRound(s);
    expect(s.levelProgress.level).toBe(1);
    s = winRound(s);
    expect(s.levelProgress).toEqual({ level: 2, wins: 0, rounds: 0, losses: 0 });
    expect(winRound(atLevel(LEVELS.length, { wins: 10_000 })).levelProgress.level).toBe(LEVELS.length);
  });

  it(`drops one level after ${LOSSES_TO_DROP} losses in a row, and the next round uses it`, () => {
    let s = loseTimes(atLevel(4), LOSSES_TO_DROP - 1);
    expect(s.levelProgress.level).toBe(4);
    s = loseRound(s);
    expect(s.round!.level).toBe(4);
    expect(s.levelProgress).toEqual({ level: 3, wins: 0, rounds: 0, losses: 0 });
    expect(startRound(s).round!.level).toBe(3);
  });

  it('a win in between clears the losses', () => {
    let s = loseTimes(atLevel(4), LOSSES_TO_DROP - 1);
    s = winRound(s);
    expect(s.levelProgress.losses).toBe(0);
    expect(loseTimes(s, LOSSES_TO_DROP - 1).levelProgress.level).toBe(4);
  });

  it('losses in the first rounds on a new level never count, so drops never chain', () => {
    // Just dropped to 3: the grace rounds are free, then it takes the full run again
    let s = loseTimes(atLevel(3, { rounds: 0 }), LEVEL_GRACE_ROUNDS);
    expect(s.levelProgress).toMatchObject({ level: 3, losses: 0 });
    s = loseTimes(s, LOSSES_TO_DROP - 1);
    expect(s.levelProgress.level).toBe(3);
    expect(loseRound(s).levelProgress.level).toBe(2);
  });

  it('never drops below level 1', () => {
    expect(loseTimes(atLevel(1), LOSSES_TO_DROP * 2).levelProgress.level).toBe(1);
  });

  it('losing never lowers the score', () => {
    const s = loseTimes(atLevel(4), LOSSES_TO_DROP);
    expect(s.levelProgress.level).toBe(3);
    expect(s.wordsGuessed).toBe(0);
  });

  it('a loss in the grace counts the round, not the loss', () => {
    expect(afterRound(START_LEVEL, false)).toEqual({ level: 1, wins: 0, rounds: 1, losses: 0 });
  });

  it('a save from before levels could drop keeps the level its score earned', () => {
    const { levelProgress, ...old } = initialState();
    const saved = { ...old, wordsGuessed: WORDS_PER_LEVEL * 2 + 4 } as GameState;
    const s = gameReducer(initialState(), { type: 'hydrate', state: saved });
    expect(s.levelProgress).toEqual({ level: 3, wins: 4, rounds: 4, losses: 0 });
    const top = gameReducer(initialState(), { type: 'hydrate', state: { ...saved, wordsGuessed: 10_000 } });
    expect(top.levelProgress.level).toBe(LEVELS.length);
  });

  it('a save missing newer fields gets their defaults', () => {
    const { streak, ...old } = initialState();
    expect(gameReducer(initialState(), { type: 'hydrate', state: old as GameState }).streak).toBe(0);
  });
});

describe('word picking', () => {
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
