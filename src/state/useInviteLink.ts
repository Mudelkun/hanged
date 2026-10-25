/*
 * Friend invite links on the device (Context/versus.md, Invite links):
 * accepting the invite that waits in src/invite/pending.ts, and sharing the
 * player's own link.
 *
 * Once the player is past onboarding:
 *  - a new player (the invite came before onboarding finished: it's what they
 *    installed the app for) becomes friends at once, nothing to tap;
 *  - an existing player is asked first (`asking`: the sheet).
 * Offline, or while Versus is off, the invite keeps waiting and is tried again
 * whenever the app comes back to the foreground.
 */
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Share } from 'react-native';

import type { PlayerCard } from '../../server/src/versus-contract';
import { needsOnboarding } from '../game/onboarding';
import { useTranslation } from '../i18n';
import { acceptsByItself, type PendingInvite } from '../invite/link';
import { clearInvite, watchInvite } from '../invite/pending';
import { api, ApiError, inviteLink } from '../net/api';
import { savedPlayerId } from '../net/sync';
import { useGame } from './GameContext';
import type { FriendNote } from './versus';
import { useVersus } from './VersusContext';

const REFUSALS: Partial<Record<number, Exclude<FriendNote['kind'], 'friends'>>> = { 400: 'own', 404: 'gone', 409: 'full' };
/** The server's final no, as the note that says why; null for a failure worth trying again (offline, Versus off). */
const refusal = (e: unknown) => (e instanceof ApiError && REFUSALS[e.status]) || null;

/** The invite waiting on this device, kept up to date. */
export function usePendingInvite(): PendingInvite | null {
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  useEffect(() => watchInvite(setInvite), []);
  return invite;
}

export function useInviteLink() {
  const { state: game, ready } = useGame();
  const { account, actions } = useVersus();
  const invite = usePendingInvite();
  const [asked, setAsked] = useState<{ code: string; player: PlayerCard } | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [foregrounds, setForegrounds] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setForegrounds((n) => n + 1));
    return () => sub.remove();
  }, []);

  const { friendNote } = actions;
  /** true once the server has answered for good (friends, or why not); false to try again later. */
  const accept = useCallback(
    async (code: string) => {
      const me = await account();
      if (!me) return false;
      try {
        const { status, player } = await api.acceptInvite(me, code);
        clearInvite(code);
        // 'sent': a block stands between the two, and isn't revealed
        if (status === 'friends') friendNote({ kind: 'friends', player });
        return true;
      } catch (e) {
        const kind = refusal(e);
        if (!kind) return false;
        clearInvite(code);
        friendNote({ kind });
        return true;
      }
    },
    [account, friendNote],
  );

  const active = ready && !needsOnboarding(game) ? invite : null;
  const code = active?.code;
  const byItself = !!active && acceptsByItself(active, game.legalAcceptance);
  useEffect(() => {
    if (!code) return;
    if (byItself) {
      accept(code);
      return;
    }
    let live = true;
    (async () => {
      try {
        const player = await api.inviter(code);
        if (!live) return;
        if (player.id !== (await savedPlayerId())) return setAsked({ code, player });
        clearInvite(code);
        friendNote({ kind: 'own' });
      } catch (e) {
        if (live && refusal(e) === 'gone') {
          clearInvite(code);
          friendNote({ kind: 'gone' });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [code, byItself, foregrounds, accept, friendNote]);

  // A newer invite replaces the one being asked about
  const asking = asked && asked.code === code ? asked : null;
  return {
    /** An existing player's invite: who it's from, to ask before becoming friends. */
    asking: asking?.player ?? null,
    sending,
    /** The last "Be friends" didn't reach the server. */
    failed,
    yes: async () => {
      if (!asking) return;
      setSending(true);
      setFailed(false);
      const done = await accept(asking.code);
      setSending(false);
      setFailed(!done);
    },
    no: () => {
      if (asking) clearInvite(asking.code);
      setFailed(false);
    },
  };
}

/**
 * Shares the player's own invite link: the share sheet, or the clipboard where
 * there's none (the web preview). false offline or while Versus is off.
 */
export function useShareInvite() {
  const t = useTranslation();
  const { account } = useVersus();
  return useCallback(async (): Promise<'shared' | 'copied' | false> => {
    const me = await account();
    if (!me) return false;
    let url: string;
    try {
      url = inviteLink((await api.myInvite(me)).code);
    } catch {
      return false;
    }
    if (!url) return false;
    const message = t('invite.share.message');
    try {
      // iOS shows the link as its own preview card; Android shares text only
      await Share.share(Platform.OS === 'ios' ? { message, url } : { message: `${message} ${url}` });
      return 'shared';
    } catch {
      await Clipboard.setStringAsync(url);
      return 'copied';
    }
  }, [account, t]);
}
