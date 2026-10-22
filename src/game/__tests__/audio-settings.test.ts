import { gameReducer, initialState, GameState } from '../progress';

test('older saves enable audio without changing gameplay progress', () => {
  const { soundEnabled, musicEnabled, ...old } = { ...initialState(), tokens: 123, wordsGuessed: 18 };
  expect(soundEnabled && musicEnabled).toBe(true);
  const loaded = gameReducer(initialState(), { type: 'hydrate', state: old as GameState });
  expect(loaded.soundEnabled).toBe(true); expect(loaded.musicEnabled).toBe(true);
  expect(loaded.tokens).toBe(123); expect(loaded.wordsGuessed).toBe(18);
});
test('sound and music switches persist independently through hydration', () => {
  let state = initialState();
  state = gameReducer(state, { type: 'audioSetting', setting: 'soundEnabled', enabled: false });
  expect(state.musicEnabled).toBe(true);
  state = gameReducer(state, { type: 'audioSetting', setting: 'musicEnabled', enabled: false });
  const loaded = gameReducer(initialState(), { type: 'hydrate', state: JSON.parse(JSON.stringify(state)) });
  expect(loaded.soundEnabled).toBe(false); expect(loaded.musicEnabled).toBe(false);
  expect(loaded.tokens).toBe(initialState().tokens);
});
