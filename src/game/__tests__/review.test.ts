import { REVIEW_AFTER_STREAK, REVIEW_AFTER_WORDS } from '../config';
import { decoyLetters, usedLetters } from '../engine';
import { gameReducer, GameState, initialState, reviewWanted } from '../progress';

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
  for (const c of 'castle') state = gameReducer(state, { type: 'guess', letter: c, at: 1 });
  return state;
}

function loseRound(s: GameState): GameState {
  let state = startRound(s);
  const wrong = decoyLetters(word.word).filter((c) => !usedLetters(state.round!).has(c));
  for (const c of wrong.slice(0, state.round!.maxWrong)) state = gameReducer(state, { type: 'guess', letter: c, at: 1 });
  return state;
}

const player: GameState = { ...initialState(), onboardingCompleted: true };
const wins = (s: GameState, n: number) => Array.from({ length: n }).reduce<GameState>(winRound, s);

describe('the store review prompt', () => {
  it('waits past the first words and for a win on a roll', () => {
    expect(reviewWanted(winRound(player))).toBe(false);
    const enough = Math.max(REVIEW_AFTER_WORDS, REVIEW_AFTER_STREAK);
    expect(reviewWanted(wins(player, enough - 1))).toBe(false);
    expect(reviewWanted(wins(player, enough))).toBe(true);
  });

  it('never asks on a loss or before the round is over', () => {
    const veteran = wins(player, REVIEW_AFTER_WORDS + REVIEW_AFTER_STREAK);
    expect(reviewWanted(loseRound(veteran))).toBe(false);
    expect(reviewWanted(startRound(veteran))).toBe(false);
    // A loss breaks the run: the next win alone isn't one.
    expect(reviewWanted(winRound(loseRound(veteran)))).toBe(REVIEW_AFTER_STREAK <= 1);
  });

  it('needs onboarding done', () => {
    expect(reviewWanted({ ...wins(player, 10), onboardingCompleted: false })).toBe(false);
  });

  it('asks once ever', () => {
    const due = wins(player, 10);
    const asked = gameReducer(due, { type: 'reviewAsked', at: 1000 });
    expect(asked.reviewAskedAt).toBe(1000);
    expect(reviewWanted(asked)).toBe(false);
    expect(reviewWanted(wins(asked, 20))).toBe(false);
    expect(gameReducer(asked, { type: 'reviewAsked', at: 2000 })).toBe(asked);
  });

  it('defaults to never asked on old saves and drops a malformed value', () => {
    const { reviewAskedAt, ...old } = initialState();
    expect(gameReducer(initialState(), { type: 'hydrate', state: old as GameState }).reviewAskedAt).toBeNull();
    const bad = { ...initialState(), reviewAskedAt: 'yes' as unknown as number };
    expect(gameReducer(initialState(), { type: 'hydrate', state: bad }).reviewAskedAt).toBeNull();
    const kept = { ...initialState(), reviewAskedAt: 5 };
    expect(gameReducer(initialState(), { type: 'hydrate', state: kept }).reviewAskedAt).toBe(5);
  });
});
