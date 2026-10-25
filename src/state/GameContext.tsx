/*
 * Holds the player's game state (src/game/progress.ts) and saves it on the
 * device with AsyncStorage. The device is the source of truth (offline
 * first): the server only receives a copy for the leaderboard and the word
 * statistics, whenever a sync gets through (src/net/sync.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useState } from 'react';
import { AppState } from 'react-native';

import { randomName } from '../game/names';
import { needsOnboarding } from '../game/onboarding';
import { Language, languageForLocales } from '../game/languages';
import { finishingGuesses, GameAction, gameReducer, GameState, initialState, nextWord } from '../game/progress';
import { setLanguage } from '../i18n';
import { createSync, nameIsFree } from '../net/sync';
import { useReminders } from './useDaily';

const STORAGE_KEY = 'hanged.game.v1';
/** Finished rounds wait this long for more before a sync, so a run of quick words is one request. */
const SYNC_AFTER_ROUND_MS = 20_000;

interface GameContextValue {
  state: GameState;
  ready: boolean;
  dispatch: (action: GameAction) => void;
  startNextRound: () => void;
  changeLanguage: (language: Language) => void;
  /** Developer (`anyLevel`): play at `level`, from a new word there. Ignored without the role. */
  jumpToLevel: (level: number) => void;
  /** Developer (`devTools`): ends the round won or lost with ordinary guesses. Ignored without the role. */
  finishRound: (won: boolean) => void;
  /** Syncs with the server now. Resolves to the player's server id, or null offline. */
  syncNow: () => Promise<string | null>;
  /**
   * Deletes the account on the server, then starts the game over on this
   * device. Resolves false (and changes nothing) when the server can't be reached.
   */
  deleteAccount: () => Promise<boolean>;
  /** Names are unique: false only when the server says someone else has it (offline: true, the sync settles it). */
  nameIsFree: (name: string) => Promise<boolean>;
  completeOnboarding: (name: string, characterId: string) => void;
  /** The daily reminder on or off. On asks the OS first; resolves to what was saved. */
  setReminders: (enabled: boolean) => Promise<boolean>;
  welcomePending: boolean;
  dismissWelcome: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const newRoundId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialState(languageForLocales(getLocales().map(l => l.languageTag))));
  const [ready, setReady] = useState(false);
  const [welcomePending, setWelcomePending] = useState(false);
  const dismissWelcome = useCallback(() => setWelcomePending(false), []);
  const completeOnboarding = useCallback((name: string, characterId: string) => {
    setWelcomePending(!state.onboardingCompleted);
    dispatch({ type: 'completeOnboarding', name, characterId, accepted: true, at: Date.now() });
  }, [state.onboardingCompleted]);

  // Load once. A missing or unreadable save starts a fresh player.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as GameState) : null;
        // hydrate fills in fields an older save lacks, so it must see the save as stored
        if (saved?.version === 1) dispatch({ type: 'hydrate', state: saved });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [ready, state]);

  useLayoutEffect(() => setLanguage(state.language), [state.language]);
  const changeLanguage = useCallback((language: Language) => {
    dispatch({ type: 'language', language, roundId: newRoundId() });
  }, []);

  const setReminders = useReminders(state, ready, dispatch);

  // The sync reads the latest state when it runs, never the one it was scheduled with.
  const [sync] = useState(() => createSync(dispatch));
  const syncReady = ready && !needsOnboarding(state);
  useEffect(() => sync.update(syncReady ? state : null), [sync, syncReady, state]);
  const pending = state.reports.length;
  useEffect(() => {
    if (!syncReady) return;
    sync.run();
    // Coming back, or leaving: iOS gives a few seconds in the background, enough for one request.
    const sub = AppState.addEventListener('change', (s) => s !== 'inactive' && sync.run());
    return () => sub.remove();
  }, [syncReady, sync]);
  useEffect(() => {
    if (!syncReady || !pending) return;
    const id = setTimeout(sync.run, SYNC_AFTER_ROUND_MS);
    return () => clearTimeout(id);
  }, [syncReady, pending, sync]);

  const startNextRound = useCallback(() => {
    dispatch({ type: 'newRound', word: nextWord(state), roundId: newRoundId() });
  }, [state]);

  const jumpToLevel = useCallback((level: number) => dispatch({ type: 'jumpToLevel', level, roundId: newRoundId() }), []);
  const finishRound = useCallback((won: boolean) => {
    const at = Date.now();
    for (const letter of finishingGuesses(state, won)) dispatch({ type: 'guess', letter, at });
  }, [state]);

  // First launch (or a save from before rounds existed): deal a word.
  useEffect(() => {
    if (ready && !state.round) startNextRound();
  }, [ready, state.round, startNextRound]);

  // A new player (or a save from before names) gets a friendly random name; the Profile page changes it.
  useEffect(() => {
    if (ready && !state.playerName) dispatch({ type: 'rename', name: randomName(undefined, state.language) });
  }, [ready, state.playerName, state.language]);

  const deleteAccount = useCallback(async () => {
    const deleted = await sync.deleteAccount();
    if (deleted) {
      setWelcomePending(false);
      // Dealt in the same batch, so there's never a state without a round (the root Gate would unmount the app)
      dispatch({ type: 'reset' });
      dispatch({ type: 'rename', name: randomName() });
      dispatch({ type: 'newRound', word: nextWord(initialState()), roundId: newRoundId() });
    }
    return deleted;
  }, [sync]);

  const value = useMemo(
    () => ({ state, ready, dispatch, startNextRound, changeLanguage, jumpToLevel, finishRound, syncNow: sync.run, deleteAccount, nameIsFree, completeOnboarding, setReminders, welcomePending, dismissWelcome }),
    [state, ready, startNextRound, changeLanguage, jumpToLevel, finishRound, sync, deleteAccount, completeOnboarding, setReminders, welcomePending, dismissWelcome],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
