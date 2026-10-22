import { CHARACTERS } from '../../characters/rig';
import {
  CHARACTER_PRICES,
  DEFAULT_CHARACTER,
  DEFAULT_MAX_WRONG,
  LETTER_BUY_COST,
  LETTER_BUY_COUNT,
  LEVEL_GRACE_ROUNDS,
  LOSSES_TO_DROP,
  STARTING_TOKENS,
  STREAK_BONUS_AT,
  WORDS_PER_LEVEL,
} from '../config';
import { clueCount, decoyLetters, roundStatus, usedLetters } from '../engine';
import { afterRound, LEVELS, LevelProgress, START_LEVEL, wordsToNextLevel } from '../levels';
import {
  canBuyCharacter,
  characterPrice,
  gameReducer,
  GameState,
  initialState,
  lettersForSale,
  nextWord,
  ownsCharacter,
  REPORTS_KEPT,
  streakMeter,
  tokenReward,
} from '../progress';
import { levelPool, pickWord } from '../words';

const word = {
  id: 'en-castle',
  word: 'castle',
  language: 'en',
  description: 'A big stone home for a king.',
  sense: 'oewn-02983900-n',
  rarity: 10,
  concrete: true,
  difficulty: 1,
  subject: 'object',
};

const startRound = (s: GameState) => gameReducer(s, { type: 'newRound', word, roundId: 'r', rng: () => 0 });

function winRound(s: GameState): GameState {
  let state = startRound(s);
  for (const c of 'castle') state = gameReducer(state, { type: 'guess', letter: c, at: 0 });
  return state;
}

function loseRound(s: GameState): GameState {
  let state = startRound(s);
  const wrong = decoyLetters(word.word).filter((c) => !usedLetters(state.round!).has(c));
  for (const c of wrong.slice(0, state.round!.maxWrong)) state = gameReducer(state, { type: 'guess', letter: c, at: 0 });
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
    s = gameReducer(s, { type: 'guess', letter: 'z', at: 0 });
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

  it('the meter fills one stretch per bonus step, then laps once the bonus is maxed', () => {
    const last = STREAK_BONUS_AT[STREAK_BONUS_AT.length - 1];
    for (let n = 1; n <= last * 3; n++) {
      const m = streakMeter(n);
      expect(m.from).toBeLessThan(n);
      expect(m.to).toBeGreaterThanOrEqual(n);
      expect(m.full).toBe(n === m.to);
      expect(m.bonus).toBe(tokenReward(1, n) - base);
      // A full stretch below the max is exactly a bonus step
      if (m.tier < STREAK_BONUS_AT.length) expect(m.full).toBe(STREAK_BONUS_AT.includes(n));
      else expect(n).toBeGreaterThan(last);
    }
    expect(streakMeter(1)).toEqual({ tier: 0, from: 0, to: STREAK_BONUS_AT[0], full: false, bonus: 0 });
    expect(streakMeter(STREAK_BONUS_AT[0] + 1)).toMatchObject({ tier: 1, from: STREAK_BONUS_AT[0], bonus: 1 });
    const lap = last - STREAK_BONUS_AT[STREAK_BONUS_AT.length - 2];
    expect(streakMeter(last + 1)).toMatchObject({ tier: STREAK_BONUS_AT.length, from: last, to: last + lap });
    expect(streakMeter(last + lap + 1)).toMatchObject({ from: last + lap, to: last + 2 * lap });
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

describe('retired hint words and description unlocks', () => {
  it.each([false, true])('preserves progress and queued reports when restoring descriptionUnlocked = %s', (descriptionUnlocked) => {
    const finished = winRound(initialState());
    // A queued report from before descriptions were always visible must keep its original value.
    const reports = [{ ...finished.reports[0], description: false }];
    let saved = startRound({ ...finished, reports, tokens: 0, streak: 4, wordsGuessed: 7 });
    saved = gameReducer(saved, { type: 'guess', letter: 'z', at: 0 });
    for (const extra of [{}, { hints: ['king', 'tower', 'stone'] }]) {
      const legacy = { ...saved, round: { ...saved.round!, descriptionUnlocked, ...extra } };
      const restored = gameReducer(initialState(), { type: 'hydrate', state: legacy });
      expect(restored).toEqual(saved);
      expect(restored.round).not.toHaveProperty('hints');
      expect(restored.round).not.toHaveProperty('descriptionUnlocked');
      expect(legacy.round.descriptionUnlocked).toBe(descriptionUnlocked);
      expect(gameReducer(initialState(), { type: 'hydrate', state: restored })).toEqual(restored);
    }
  });
});

describe('help on hard levels', () => {
  const firstWith = (has: (l: (typeof LEVELS)[number]) => boolean) => LEVELS.find(has)!.level;

  it('shows the subject for free from level 9 (owner), never before', () => {
    expect(firstWith((l) => l.showsSubject)).toBe(9);
    const at = (level: number) => gameReducer(atLevel(level), { type: 'newRound', word, roundId: 'r', rng: () => 0 });
    expect(at(8).round!.subject).toBeUndefined();
    expect(at(9).round!.subject).toBe(word.subject);
    expect(at(9).tokens).toBe(STARTING_TOKENS);
  });

  it('never takes help away or deals easier words as levels rise', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const [prev, next] = [LEVELS[i - 1], LEVELS[i]];
      expect(next.toFind).toBeGreaterThanOrEqual(prev.toFind);
      if (prev.showsSubject) expect(next.showsSubject).toBe(true);
      if (prev.sellsLetters) expect(next.sellsLetters).toBe(true);
      expect(next.maxWrong).toBeGreaterThanOrEqual(DEFAULT_MAX_WRONG);
      expect(next.maxDifficulty).toBeGreaterThanOrEqual(prev.maxDifficulty);
      expect(next.maxRarity).toBeGreaterThanOrEqual(prev.maxRarity);
      expect(next.tokenReward).toBeGreaterThanOrEqual(prev.tokenReward);
    }
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

describe('always-visible descriptions', () => {
  it.each([true, false])('reports the description as shown after a round ends (won = %s)', (won) => {
    const s = (won ? winRound : loseRound)({ ...initialState(), tokens: 0 });
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0]).toMatchObject({ won, description: true });
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

describe('characters', () => {
  const prices = Object.values(CHARACTER_PRICES);
  const paid = Object.keys(CHARACTER_PRICES).find((id) => CHARACTER_PRICES[id] > 0)!;
  const price = characterPrice(paid)!;
  const rich = { ...initialState(), tokens: price + 5 };

  it('prices every character, cheapest first, and the default one is free', () => {
    expect(Object.keys(CHARACTER_PRICES).sort()).toEqual(CHARACTERS.map((c) => c.id).sort());
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(characterPrice(DEFAULT_CHARACTER)).toBe(0);
    expect(initialState().characterId).toBe(DEFAULT_CHARACTER);
    expect(characterPrice('nobody')).toBeNull();
  });

  it('a new player owns only the free characters', () => {
    const s = initialState();
    for (const [id, p] of Object.entries(CHARACTER_PRICES)) expect(ownsCharacter(s, id)).toBe(p === 0);
  });

  it('buying pays the price, unlocks the character and plays with it, and never lowers the score', () => {
    const s = gameReducer({ ...rich, wordsGuessed: 9 }, { type: 'buyCharacter', id: paid });
    expect(s.tokens).toBe(5);
    expect(ownsCharacter(s, paid)).toBe(true);
    expect(s.characterId).toBe(paid);
    expect(s.wordsGuessed).toBe(9);
    // A character is bought once
    expect(canBuyCharacter(s, paid)).toBe(false);
    expect(gameReducer({ ...s, tokens: price }, { type: 'buyCharacter', id: paid }).tokens).toBe(price);
  });

  it('is refused without enough tokens, for a free character, or one not in the shop', () => {
    const poor = { ...initialState(), tokens: price - 1 };
    expect(gameReducer(poor, { type: 'buyCharacter', id: paid })).toBe(poor);
    expect(gameReducer(rich, { type: 'buyCharacter', id: DEFAULT_CHARACTER })).toBe(rich);
    expect(gameReducer(rich, { type: 'buyCharacter', id: 'nobody' })).toBe(rich);
  });

  it('selects only characters the player owns', () => {
    const s = initialState();
    expect(gameReducer(s, { type: 'selectCharacter', id: paid })).toBe(s);
    const owned = gameReducer(rich, { type: 'buyCharacter', id: paid });
    const back = gameReducer(owned, { type: 'selectCharacter', id: DEFAULT_CHARACTER });
    expect(back.characterId).toBe(DEFAULT_CHARACTER);
    expect(gameReducer(back, { type: 'selectCharacter', id: paid }).characterId).toBe(paid);
    expect(gameReducer(back, { type: 'selectCharacter', id: DEFAULT_CHARACTER })).toBe(back);
  });

  it('a mid-round switch keeps the round as it is', () => {
    const playing = startRound(rich);
    const s = gameReducer(playing, { type: 'buyCharacter', id: paid });
    expect(s.round).toBe(playing.round);
    expect(gameReducer(s, { type: 'selectCharacter', id: DEFAULT_CHARACTER }).round).toBe(s.round);
  });

  it('a save from before the shop keeps its character, and one that left the shop goes back to the default', () => {
    const { unlockedCharacterIds, ...old } = initialState();
    const kept = gameReducer(initialState(), { type: 'hydrate', state: { ...old, characterId: paid } as GameState });
    expect([kept.characterId, ownsCharacter(kept, paid)]).toEqual([paid, true]);
    const gone = gameReducer(initialState(), { type: 'hydrate', state: { ...initialState(), characterId: 'nobody' } });
    expect(gone.characterId).toBe(DEFAULT_CHARACTER);
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

  it('remembers the highest level reached, so a drop keeps it on the level path', () => {
    let s = winRound(atLevel(4, { wins: WORDS_PER_LEVEL - 1 }));
    expect(s.bestLevel).toBe(5);
    s = loseTimes({ ...s, levelProgress: { ...s.levelProgress, rounds: LEVEL_GRACE_ROUNDS } }, LOSSES_TO_DROP);
    expect(s.levelProgress.level).toBe(4);
    expect(s.bestLevel).toBe(5);
  });

  it('counts the words left to the next level, and none on the last one', () => {
    expect(wordsToNextLevel(START_LEVEL)).toBe(WORDS_PER_LEVEL);
    expect(wordsToNextLevel({ ...START_LEVEL, wins: 3 })).toBe(WORDS_PER_LEVEL - 3);
    expect(wordsToNextLevel({ ...START_LEVEL, level: LEVELS.length })).toBeNull();
  });

  it('a save from before the level path knows its current level as the best', () => {
    const { bestLevel, ...old } = atLevel(7);
    expect(gameReducer(initialState(), { type: 'hydrate', state: old as GameState }).bestLevel).toBe(7);
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
  /** Deals `count` rounds in a row and returns the state and the word ids dealt. */
  function deal(s: GameState, count: number, rng: () => number = Math.random) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const w = nextWord(s, rng);
      ids.push(w.id);
      s = gameReducer(s, { type: 'newRound', word: w, roundId: `r${i}`, rng });
    }
    return { s, ids };
  }

  it('has words for every level', () => {
    for (const level of LEVELS) {
      const w = pickWord(level, 'en', [], () => 0.5);
      expect(w.word.length).toBeGreaterThanOrEqual(level.minLength);
      expect(w.word.length).toBeLessThanOrEqual(level.maxLength);
      expect(w.rarity).toBeLessThanOrEqual(level.maxRarity);
      if (level.concreteOnly) expect(w.concrete).toBe(true);
      expect(levelPool(level, 'en').every((e) => e.difficulty <= level.maxDifficulty)).toBe(true);
    }
  });

  const entry = (w: string, rarity: number, concrete = true) => ({ ...word, id: `en-${w}`, word: w, rarity, concrete });

  it('deals only words common enough for the level', () => {
    expect(levelPool(LEVELS[0], 'en').every((w) => w.rarity <= LEVELS[0].maxRarity)).toBe(true);
    const harp = entry('harp', 50);
    const dog = entry('dog', 10);
    expect(levelPool(LEVELS[0], 'en', [harp, dog])).toEqual([dog]);
    // with nothing common enough, the most common words left
    expect(levelPool(LEVELS[0], 'en', [harp, entry('lute', 35)]).map((w) => w.word)).toEqual(['lute']);
  });

  it("leaves the level's letters to find, and more of them as levels rise", () => {
    // castle has 6 distinct letters; the reducer passes the level's toFind (rng 0 = its whole part)
    const clues = (level: number) =>
      gameReducer(atLevel(level), { type: 'newRound', word, roundId: 'r', rng: () => 0 }).round!.clueLetters.length;
    expect(clues(1)).toBe(clueCount('castle', Math.floor(LEVELS[0].toFind)));
    expect(clues(1)).toBe(4);
    expect(clues(10)).toBe(2);
  });

  it('deals no word harder to guess than the level allows', () => {
    const easy = { ...entry('dog', 10), difficulty: 0 };
    const hard = { ...entry('jinx', 10), difficulty: LEVELS[0].maxDifficulty + 1 };
    expect(levelPool(LEVELS[0], 'en', [hard, easy])).toEqual([easy]);
    // with nothing easy enough, the easiest words left
    const harder = { ...entry('jazz', 10), difficulty: hard.difficulty + 3 };
    expect(levelPool(LEVELS[0], 'en', [harder, hard])).toEqual([hard]);
  });

  it('deals only things you can picture on easy levels, every kind of word later', () => {
    expect(levelPool(LEVELS[0], 'en').every((w) => w.concrete)).toBe(true);
    const calm = entry('calm', 10, false);
    const dog = entry('dog', 10);
    expect(levelPool(LEVELS[0], 'en', [calm, dog])).toEqual([dog]);
    // the right kind before the right rarity, and any kind when there's none
    expect(levelPool(LEVELS[0], 'en', [calm, entry('lute', 50)]).map((w) => w.word)).toEqual(['lute']);
    expect(levelPool(LEVELS[0], 'en', [calm])).toEqual([calm]);
    const hard = LEVELS.find((l) => !l.concreteOnly)!;
    const harmony = entry('harmonies', 10, false);
    const giraffes = entry('giraffes', 10);
    expect(levelPool(hard, 'en', [harmony, giraffes])).toEqual([harmony, giraffes]);
  });

  it('never repeats a word before the level has dealt them all', () => {
    const pool = levelPool(LEVELS[0], 'en').map((w) => w.id);
    const { ids } = deal(initialState(), pool.length);
    expect(new Set(ids).size).toBe(pool.length);
    expect([...ids].sort()).toEqual([...pool].sort());
  });

  it('then starts the level over, never with the word just played', () => {
    const pool = levelPool(LEVELS[0], 'en');
    // rng 0 deals the pool in order, so the next cycle's first pick would be the last word without the rule
    const { s, ids } = deal(initialState(), pool.length, () => 0.9999);
    const next = deal(s, pool.length - 1, () => 0.9999);
    expect(next.ids[0]).not.toBe(ids[ids.length - 1]);
    expect(new Set(next.ids).size).toBe(pool.length - 1);
    expect(next.ids).not.toContain(ids[ids.length - 1]);
  });

  it('deals in a different order each time', () => {
    const pool = levelPool(LEVELS[0], 'en');
    expect(deal(initialState(), pool.length, () => 0).ids).not.toEqual(deal(initialState(), pool.length, () => 0.5).ids);
  });

  it('remembers dealt words', () => {
    expect(startRound(initialState()).seenWordIds).toEqual(['en-castle']);
  });

  it('a save from the "last 40 words" memory counts those words as seen', () => {
    const { seenWordIds, ...rest } = initialState();
    const old = { ...rest, recentWordIds: ['en-cat', 'en-xyzzy', 'en-sun'] } as unknown as GameState;
    const s = gameReducer(initialState(), { type: 'hydrate', state: old });
    expect(s.seenWordIds).toEqual(['en-sun', 'en-cat']);
    expect('recentWordIds' in s).toBe(false);
  });
});

describe('round reports (server outbox)', () => {
  it('queues one report per finished round, in the step that ends it', () => {
    let s = winRound(initialState());
    s = gameReducer(s, { type: 'guess', letter: 'z', at: 0 });
    s = loseRound(s);
    expect(s.reports.map((r) => [r.seq, r.wordId, r.won])).toEqual([
      [1, 'en-castle', true],
      [2, 'en-castle', false],
    ]);
    expect(s.reports[1].wrong).toBe(s.round!.maxWrong);
    expect(s.nextReportSeq).toBe(3);
  });

  it('drops what the server confirmed, and keeps the seq counting', () => {
    let s = loseRound(winRound(initialState()));
    s = gameReducer(s, { type: 'reportsSent', upTo: 1 });
    expect(s.reports.map((r) => r.seq)).toEqual([2]);
    expect(gameReducer(s, { type: 'reportsSent', upTo: 1 })).toBe(s);
    expect(winRound(s).reports.map((r) => r.seq)).toEqual([2, 3]);
  });

  it('keeps at most REPORTS_KEPT, dropping the oldest', () => {
    const full = { ...initialState(), reports: Array.from({ length: REPORTS_KEPT }, (_, i) => ({ ...winRound(initialState()).reports[0], seq: i + 1 })), nextReportSeq: REPORTS_KEPT + 1 };
    const s = winRound(full);
    expect(s.reports).toHaveLength(REPORTS_KEPT);
    expect(s.reports[0].seq).toBe(2);
  });

  it('starts an old save with an empty outbox', () => {
    const { reports, nextReportSeq, ...old } = initialState();
    const s = gameReducer(initialState(), { type: 'hydrate', state: old as GameState });
    expect([s.reports, s.nextReportSeq]).toEqual([[], 1]);
  });
});
