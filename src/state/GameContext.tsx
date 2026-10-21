/*
 * Holds the player's game state (src/game/progress.ts) and saves it on the
 * device with AsyncStorage. There is no backend yet: tokens, score and the
 * round in progress live only on this phone until accounts exist.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';

import { GameAction, gameReducer, GameState, initialState, nextWord } from '../game/progress';
import { setLanguage } from '../i18n';

const STORAGE_KEY = 'hanged.game.v1';

interface GameContextValue {
  state: GameState;
  ready: boolean;
  dispatch: (action: GameAction) => void;
  startNextRound: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const newRoundId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialState);
  const [ready, setReady] = useState(false);

  // Load once. A missing or unreadable save starts a fresh player.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as GameState) : null;
        if (saved?.version === 1) dispatch({ type: 'hydrate', state: { ...initialState(), ...saved } });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [ready, state]);

  useEffect(() => setLanguage(state.language), [state.language]);

  const startNextRound = useCallback(() => {
    dispatch({ type: 'newRound', word: nextWord(state), roundId: newRoundId() });
  }, [state]);

  // First launch (or a save from before rounds existed): deal a word.
  useEffect(() => {
    if (ready && !state.round) startNextRound();
  }, [ready, state.round, startNextRound]);

  const value = useMemo(() => ({ state, ready, dispatch, startNextRound }), [state, ready, startNextRound]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
