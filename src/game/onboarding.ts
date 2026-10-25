import type { GameState } from './progress';

/** The date the bundled legal texts took effect (shown as "Last updated"). Any change to them needs a new date: players accept again. */
export const LEGAL_VERSION = '2026-10-25';
export const STARTER_CHARACTERS = ['coco', 'bun'] as const;
export const LIFT_OFF_MS = 1500;
export const WELCOME_MS = 2400;

export interface LegalAcceptance {
  version: string;
  acceptedAt: number;
}

export const needsOnboarding = (state: Pick<GameState, 'onboardingCompleted' | 'legalAcceptance'>) =>
  !state.onboardingCompleted || state.legalAcceptance?.version !== LEGAL_VERSION;
