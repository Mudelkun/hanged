import type { GameState } from './progress';

/** The bundled legal pages are still drafts. Replace this version when their real text ships. */
export const LEGAL_VERSION = '2026-10-22-draft';
export const STARTER_CHARACTERS = ['coco', 'bun'] as const;
export const LIFT_OFF_MS = 1500;
export const WELCOME_MS = 2400;

export interface LegalAcceptance {
  version: string;
  acceptedAt: number;
}

export const needsOnboarding = (state: Pick<GameState, 'onboardingCompleted' | 'legalAcceptance'>) =>
  !state.onboardingCompleted || state.legalAcceptance?.version !== LEGAL_VERSION;
