/*
 * Friend invite codes, read out of whatever carries them: the link itself
 * (https://<server>/i/<code>, and hanged://i/<code> or Expo Go's
 * exp://…/--/i/<code> as a deep link) or Google Play's install referrer
 * ("invite=<code>", set by the link's page). Pure, no React.
 */
import { INVITE_PATH, LOBBY_CODE_ALPHABET, VERSUS_LIMITS } from '../../server/src/versus-contract';

const CODE = `([${LOBBY_CODE_ALPHABET}]{${VERSUS_LIMITS.inviteCodeLength}})`;
const IN_LINK = new RegExp(`${INVITE_PATH.replace(/\//g, '\\/')}${CODE}(?=$|[/?#])`, 'i');
const IN_REFERRER = new RegExp(`(?:^|&)invite=${CODE}(?=$|&)`, 'i');

/** The invite code in a link or an install referrer; null when there's none. */
export function inviteCodeIn(text: string | null | undefined): string | null {
  const m = text && (IN_LINK.exec(text) ?? IN_REFERRER.exec(text));
  return m ? m[1].toUpperCase() : null;
}

export interface PendingInvite {
  code: string;
  /** When this device got it (epoch ms). */
  at: number;
}

/**
 * A new player's invite is accepted by itself; an existing player is asked
 * first. New = the invite came before they finished onboarding (consent is
 * accepted at its last step), so it's what they installed the app for.
 */
export const acceptsByItself = (invite: PendingInvite, acceptance: { acceptedAt: number } | null) =>
  !!acceptance && acceptance.acceptedAt >= invite.at;
