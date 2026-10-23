import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchScreen } from '../components/LaunchScreen';
import { TokenFlightProvider } from '../components/TokenFlight';
import { AudioProvider } from '../audio/AudioProvider';
import { GameProvider, useGame } from '../state/GameContext';
import { colors } from '../theme';
import { needsOnboarding } from '../game/onboarding';

SplashScreen.preventAutoHideAsync();

/**
 * Keeps the splash screen up until the fonts and the saved game are loaded, then mounts the app
 * with the loading screen over it: once per launch (it hides the native splash on its first frame).
 */
function Gate({ fontsDone, children }: { fontsDone: boolean; children: ReactNode }) {
  const { ready, state } = useGame();
  const done = fontsDone && ready && !!state.round && !!state.playerName;
  const [launching, setLaunching] = useState(true);
  const launched = useCallback(() => setLaunching(false), []);
  if (!done) return null;
  return <>
    {children}
    {launching && <LaunchScreen characterId={needsOnboarding(state) ? null : state.characterId} onDone={launched} />}
  </>;
}

function Routes() {
  const { state } = useGame();
  const onboarding = needsOnboarding(state);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Protected guard={!onboarding}>
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        <Stack.Screen name="profile" />
        <Stack.Screen name="info/[page]" />
      </Stack.Protected>
      <Stack.Protected guard={onboarding}>
        <Stack.Screen name="onboarding" options={{ animation: 'none', gestureEnabled: false }} />
      </Stack.Protected>
    </Stack>
  );
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
          <AudioProvider>
            <TokenFlightProvider>
              <StatusBar style="dark" />
              <Routes />
            </TokenFlightProvider>
          </AudioProvider>
        </Gate>
      </GameProvider>
    </SafeAreaProvider>
  );
}
