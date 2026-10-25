import { LEGAL_VERSION, needsOnboarding, STARTER_CHARACTERS } from '../onboarding';
import { gameReducer, GameAction, GameState, initialState, nextWord, ownsCharacter } from '../progress';

const complete: GameAction = { type: 'completeOnboarding', name: '  SunnyOtter  ', characterId: 'coco', accepted: true, at: 1792670400000 };

test('new players need onboarding and each offered starter is free', () => {
  const state = initialState();
  expect(needsOnboarding(state)).toBe(true);
  expect(state.legalAcceptance).toBeNull();
  for (const id of STARTER_CHARACTERS) expect(ownsCharacter(state, id)).toBe(true);
});

test('completion saves the checked identity and versioned consent without changing the game', () => {
  const fresh = initialState();
  const state = gameReducer(fresh, { type: 'newRound', word: nextWord(fresh, () => 0), roundId: 'first', rng: () => 0 });
  const done = gameReducer(state, complete);
  expect(done.playerName).toBe('SunnyOtter');
  expect(done.characterId).toBe('coco');
  expect(done.legalAcceptance).toEqual({ version: LEGAL_VERSION, acceptedAt: complete.at });
  expect(needsOnboarding(done)).toBe(false);
  expect(done.round).toBe(state.round);
  expect(done.tokens).toBe(state.tokens);
  expect(done.wordsGuessed).toBe(0);
  expect(gameReducer(initialState(), { type: 'hydrate', state: JSON.parse(JSON.stringify(done)) })).toEqual(done);
});

test('acceptance, a valid name, and an offered starter are enforced in the reducer', () => {
  const state = initialState();
  for (const patch of [{ accepted: false }, { name: 'Admin' }, { name: '' }, { characterId: 'ember' }, { characterId: 'mochi' }, { at: NaN }, { at: 0 }]) {
    expect(gameReducer(state, { ...complete, ...patch })).toBe(state);
  }
});

test('old saves skip identity setup, keep progress and ownership, and ask for consent once', () => {
  const fresh = initialState();
  const playing = gameReducer(fresh, { type: 'newRound', word: nextWord(fresh, () => 0), roundId: 'saved', rng: () => 0 });
  const { onboardingCompleted, legalAcceptance, ...legacy } = {
    ...playing, playerName: 'BraveOtter', characterId: 'ember', unlockedCharacterIds: ['ember'], wordsGuessed: 42, tokens: 86,
  };
  expect(onboardingCompleted).toBe(false); expect(legalAcceptance).toBeNull();
  const restored = gameReducer(initialState(), { type: 'hydrate', state: legacy as GameState });
  expect(restored.onboardingCompleted).toBe(true);
  expect(needsOnboarding(restored)).toBe(true);
  expect(restored.round).toEqual(playing.round);
  const accepted = gameReducer(restored, { ...complete, name: 'DifferentName', characterId: 'ember' });
  expect(accepted.playerName).toBe('BraveOtter');
  expect(accepted.characterId).toBe('ember');
  expect(accepted.tokens).toBe(86);
  expect(accepted.wordsGuessed).toBe(42);
  expect(accepted.unlockedCharacterIds).toEqual(['ember']);
  expect(needsOnboarding(accepted)).toBe(false);
});

test('unfinished new saves remain new, changed legal versions ask again, and deletion resets consent', () => {
  const unfinished = gameReducer(initialState(), { type: 'hydrate', state: initialState() });
  expect(unfinished.onboardingCompleted).toBe(false);
  const done = gameReducer(unfinished, complete);
  expect(needsOnboarding({ ...done, legalAcceptance: { version: 'older', acceptedAt: 1 } })).toBe(true);
  expect(gameReducer(done, { type: 'reset' })).toEqual(initialState());
});

test('a returning player consents with a name the filter refuses, such as a staff "Admin", and keeps it', () => {
  const done = gameReducer(initialState(), complete);
  const outdated = { ...done, playerName: 'Admin', legalAcceptance: { version: 'older', acceptedAt: 1 } };
  const accepted = gameReducer(outdated, { ...complete, name: 'Admin', characterId: outdated.characterId });
  expect(needsOnboarding(accepted)).toBe(false);
  expect(accepted.playerName).toBe('Admin');
  // A new player still can't pick it.
  expect(gameReducer(initialState(), { ...complete, name: 'Admin' }).onboardingCompleted).toBe(false);
});
