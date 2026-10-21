import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TokenFlightProvider } from '../components/TokenFlight';
import { GameProvider, useGame } from '../state/GameContext';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync();

/** Keeps the splash screen up until the fonts and the saved game are loaded. */
function Gate({ fontsDone, children }: { fontsDone: boolean; children: ReactNode }) {
  const { ready, state } = useGame();
  const done = fontsDone && ready && !!state.round;
  useEffect(() => {
    if (done) SplashScreen.hideAsync();
  }, [done]);
  return done ? children : null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });

  return (
    <SafeAreaProvider>
      <GameProvider>
        <Gate fontsDone={loaded || !!error}>
          <TokenFlightProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
          </TokenFlightProvider>
        </Gate>
      </GameProvider>
    </SafeAreaProvider>
  );
}
