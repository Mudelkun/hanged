import { Redirect } from 'expo-router';
import { BuddyScreen } from '../../components/Onboarding';
import { useGame } from '../../state/GameContext';

export default function BuddyRoute() {
  const { state } = useGame();
  return state.onboardingCompleted ? <Redirect href="/onboarding/name" /> : <BuddyScreen />;
}
