import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchScreen } from '../components/LaunchScreen';
import { TokenFlightProvider } from '../components/TokenFlight';
import { InviteBanner } from '../components/versus/Friends';
import { AudioProvider } from '../audio/AudioProvider';
import { GameProvider, useGame } from '../state/GameContext';
import { inRoom } from '../state/versus';
import { useVersus, VersusProvider } from '../state/VersusContext';
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

/**
 * Opens the Versus room (src/app/match.tsx) when the server puts the player
 * in a queue, lobby or match, wherever they are: a quick match, an accepted
 * invite, or a match resumed after a reconnect. Only on the way in: the room
 * closes itself when it's empty.
 */
function VersusRouter({ enabled }: { enabled: boolean }) {
  const { state } = useVersus();
  const pathname = usePathname();
  const room = inRoom(state);
  const was = useRef(room);
  useEffect(() => {
    const entered = room && !was.current;
    was.current = room;
    if (enabled && entered && pathname !== '/match') router.push('/match');
  }, [room, enabled, pathname]);
  return null;
}

function Routes() {
  const { state } = useGame();
  const onboarding = needsOnboarding(state);
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Protected guard={!onboarding}>
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
          <Stack.Screen name="profile" />
          <Stack.Screen name="info/[page]" />
          <Stack.Screen name="friends" />
          <Stack.Screen name="match" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={onboarding}>
          <Stack.Screen name="onboarding" options={{ animation: 'none', gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
      <VersusRouter enabled={!onboarding} />
      {!onboarding && <InviteBanner />}
    </>
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GameProvider>
          <Gate fontsDone={loaded || !!error}>
            <AudioProvider>
              <VersusProvider>
                <TokenFlightProvider>
                  <StatusBar style="dark" />
                  <Routes />
                </TokenFlightProvider>
              </VersusProvider>
            </AudioProvider>
          </Gate>
        </GameProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
