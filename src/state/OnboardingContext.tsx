import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { STARTER_CHARACTERS } from '../game/onboarding';
import { useGame } from './GameContext';

interface Draft {
  characterId: string;
  setCharacterId: (id: string) => void;
  name: string;
  setName: (name: string) => void;
  accepted: boolean;
  setAccepted: (accepted: boolean) => void;
}
const Context = createContext<Draft | null>(null);

/** Keeps the draft when going back or reading either legal page. Nothing is pre-accepted. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { state } = useGame();
  const [characterId, setCharacterId] = useState(state.onboardingCompleted ? state.characterId : STARTER_CHARACTERS[0]);
  const [name, setName] = useState(state.playerName ?? '');
  const [accepted, setAccepted] = useState(false);
  const value = useMemo(() => ({ characterId, setCharacterId, name, setName, accepted, setAccepted }), [characterId, name, accepted]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error('OnboardingProvider is missing');
  return value;
}
