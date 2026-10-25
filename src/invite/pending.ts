/*
 * The friend invite waiting to be accepted, and the only code that reads
 * invites from the OS: deep links (src/app/+native-intent.tsx calls
 * receiveInvite), Android's install referrer (read once, on the first
 * launch), and the iOS paste on onboarding's first screen.
 *
 * Kept on the device (hanged.invite.v1) until the server has answered, so an
 * invite that arrives offline, or before the player has an account, still
 * goes through later. src/state/useInviteLink.ts accepts it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { inviteCodeIn, type PendingInvite } from './link';

const KEY = 'hanged.invite.v1';
const REFERRER_KEY = 'hanged.referrer.v1';

const listeners = new Set<(invite: PendingInvite | null) => void>();
/** The latest invite, so one that arrives before anyone listens (a cold start from a link) isn't missed. */
let latest: PendingInvite | null | undefined;

function set(invite: PendingInvite | null) {
  latest = invite;
  listeners.forEach((l) => l(invite));
  (invite ? AsyncStorage.setItem(KEY, JSON.stringify(invite)) : AsyncStorage.removeItem(KEY)).catch(() => {});
}

/** An invite code just arrived. A newer one replaces the one waiting. */
export function receiveInvite(code: string) {
  set({ code, at: Date.now() });
}

/** The server has answered (or the player said no): nothing waits any more. */
export function clearInvite(code: string) {
  if (latest?.code === code) set(null);
}

/** Google Play keeps the code the link's page put in the store URL. Read on the first launch only. */
async function fromInstallReferrer() {
  if (Platform.OS !== 'android' || (await AsyncStorage.getItem(REFERRER_KEY))) return;
  await AsyncStorage.setItem(REFERRER_KEY, '1');
  const code = inviteCodeIn(await Application.getInstallReferrerAsync());
  if (code) receiveInvite(code);
}

let loading: Promise<void> | null = null;
function load() {
  loading ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (latest === undefined) latest = saved ? (JSON.parse(saved) as PendingInvite) : null;
      await fromInstallReferrer();
    } catch {
      latest ??= null;
    }
  })();
  return loading;
}

/** Calls `listener` with the invite waiting now (once it's loaded) and whenever it changes. */
export function watchInvite(listener: (invite: PendingInvite | null) => void): () => void {
  listeners.add(listener);
  load().then(() => listeners.has(listener) && listener(latest ?? null));
  return () => listeners.delete(listener);
}
