import { Redirect } from 'expo-router';
import { BuddyScreen } from '../../components/Onboarding';
import { useGame } from '../../state/GameContext';

export default function OnboardingScreen() {
  const { state } = useGame();
  return state.onboardingCompleted ? <Redirect href="/onboarding/name" /> : <BuddyScreen />;
}
