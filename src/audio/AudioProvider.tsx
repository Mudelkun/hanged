import { useFocusEffect, usePathname } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { useGame } from '../state/GameContext';
import { MatchMusic, sound } from './index';

/** A scope follows navigation focus even when the hidden tab stays mounted/frozen. */
export function useSoundScope() {
  const [scope] = useState(() => sound.scope());
  useFocusEffect(useCallback(() => { scope.activate(); return scope.deactivate; }, [scope]));
  return scope;
}

/** While mounted, a match's loop replaces the solo playlist; undefined hands back to it. */
export function useMatchMusic(theme?: MatchMusic) {
  useEffect(() => sound.matchMusic(theme), [theme]);
  useEffect(() => () => sound.matchMusic(undefined), []);
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { state } = useGame();
  const pathname = usePathname();
  useEffect(() => {
    sound.setForeground(AppState.currentState === null || AppState.currentState === 'active');
    void sound.start(Platform.OS !== 'web');
    const subscription = AppState.addEventListener('change', next => sound.setForeground(next === 'active'));
    return () => { subscription.remove(); sound.dispose(); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.addEventListener('keydown', sound.unlock);
    return () => document.removeEventListener('keydown', sound.unlock);
  }, []);
  useEffect(() => sound.settings(state.soundEnabled, state.musicEnabled), [state.soundEnabled, state.musicEnabled]);
  useEffect(() => sound.routeChanged(), [pathname]);
  useEffect(() => {
    const timer = setTimeout(() => sound.warm(['stretch', 'pop', 'fall', 'impact', 'bounce', 'last-pop'], state.characterId), 500);
    return () => clearTimeout(timer);
  }, [state.characterId]);
  return <View style={{ flex: 1 }} onTouchStart={sound.unlock} onPointerDown={sound.unlock}>{children}</View>;
}
