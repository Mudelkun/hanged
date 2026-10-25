/*
 * Every link that opens the app passes through here first (Expo Router).
 * A friend invite link (https://<server>/i/<code>, hanged://i/<code>) isn't a
 * screen: its code waits on the device (src/invite/pending.ts) and the app
 * stays where it is (or opens normally, on a cold start).
 */
import { inviteCodeIn } from '../invite/link';
import { receiveInvite } from '../invite/pending';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  const code = inviteCodeIn(path);
  if (!code) return path;
  receiveInvite(code);
  return initial ? '/' : null;
}
