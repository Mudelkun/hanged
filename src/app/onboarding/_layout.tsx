import { Stack } from 'expo-router';
import { OnboardingProvider } from '../../state/OnboardingContext';
import { colors } from '../../theme';

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="name" />
      </Stack>
    </OnboardingProvider>
  );
}
