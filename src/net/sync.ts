/*
 * Sends the player's stats and finished rounds to the server whenever it can.
 * The device is the source of truth; a failed sync changes nothing and the
 * next one sends the same reports again (the server skips seqs it has).
 *
 * The account (an anonymous id + secret from the server) is kept apart from
 * the game save, under its own key, and made on the first sync. Deleting it
 * (Profile) goes through here too, so it never races a sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LIMITS, type PlayerSnapshot } from '../../server/src/contract';
import type { GameAction, GameState } from '../game/progress';
import { Account, api, ApiError } from './api';

const ACCOUNT_KEY = 'hanged.account.v1';

async function savedAccount(): Promise<Account | null> {
  const saved = await AsyncStorage.getItem(ACCOUNT_KEY).catch(() => null);
  return saved ? (JSON.parse(saved) as Account) : null;
}

async function account(): Promise<Account> {
  const saved = await savedAccount();
  if (saved) return saved;
  const made = await api.register();
  await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(made));
  return made;
}

/**
 * The account Versus signs in with. A player who never synced gets one from a
 * sync first, so the server has their name and character before anyone sees
 * them. null offline.
 */
export async function versusAccount(sync: () => Promise<string | null>): Promise<Account | null> {
  return (await savedAccount()) ?? ((await sync()) ? savedAccount() : null);
}

/** The player's id on the server, if a sync ever made one (no network needed). */
export async function savedPlayerId(): Promise<string | null> {
  return (await savedAccount())?.id ?? null;
}

/**
 * false only when the server says someone else holds the name (names are
 * unique). Offline it can't know and says true: the next sync settles it, and
 * a taken name then comes back as a free variant (the reducer's `nameTaken`).
 */
export async function nameIsFree(name: string): Promise<boolean> {
  try {
    return (await api.nameAvailable(name, await savedAccount())).available;
  } catch {
    return true;
  }
}

const snapshot = (s: GameState): PlayerSnapshot => ({
  name: s.playerName,
  characterId: s.characterId,
  language: s.language,
  wordsGuessed: s.wordsGuessed,
  level: s.levelProgress.level,
  tokens: s.tokens,
});

/**
 * The provider hands it every new state with `update`, so a sync always sends
 * the latest. Until the save is loaded it holds null and doesn't sync: a fresh
 * state would hand the server a score of 0 as the player's starting point.
 */
export function createSync(dispatch: (a: GameAction) => void) {
  let latest: GameState | null = null;
  let running: Promise<string | null> | null = null;

  async function once(): Promise<string | null> {
    if (!latest) return null;
    const me = await account();
    // The state can lag behind our own dispatch, so filter by what's acked, not by what it holds.
    let acked = 0;
    for (;;) {
      const s = latest;
      // The account is being deleted: stop here
      if (!s) return null;
      const pending = s.reports.filter((r) => r.seq > acked);
      const reports = pending.slice(0, LIMITS.reportsPerSync);
      const player = snapshot(s);
      try {
        const res = await api.sync(me, { player, reports });
        acked = res.acked;
        if (player.name && res.name && res.name !== player.name) dispatch({ type: 'nameTaken', sent: player.name, name: res.name });
        // The role is the server's alone (the admin page): the device only mirrors it. An older server sends none.
        if ((res.role ?? null) !== s.role) dispatch({ type: 'role', role: res.role ?? null });
      } catch (e) {
        // The server doesn't know this player (e.g. its database was reset): start over next time.
        if (e instanceof ApiError && e.status === 401) await AsyncStorage.removeItem(ACCOUNT_KEY);
        throw e;
      }
      dispatch({ type: 'reportsSent', upTo: acked });
      if (pending.length <= reports.length) return me.id;
    }
  }

  const run = (): Promise<string | null> =>
    (running ??= once()
      .catch(() => null)
      .finally(() => {
        running = null;
      }));

  /**
   * Deletes the player on the server, then forgets the account. true once it's
   * gone (or never existed: a player who never synced has nothing there).
   * Offline it changes nothing and resolves false. No sync starts meanwhile, and
   * one already running finishes first, so it can't bring the old account back.
   */
  async function deleteAccount(): Promise<boolean> {
    const held = latest;
    latest = null;
    await running;
    try {
      const me = await savedAccount();
      if (me)
        await api.deletePlayer(me).catch((e) => {
          // The server doesn't know it (already deleted, or its database was reset): nothing left to delete.
          if (!(e instanceof ApiError && e.status === 401)) throw e;
        });
      await AsyncStorage.removeItem(ACCOUNT_KEY);
      return true;
    } catch {
      latest = held;
      return false;
    }
  }

  return {
    /** The latest state; null until the save is loaded (and while the account is being deleted). */
    update: (state: GameState | null) => {
      latest = state;
    },
    /** Syncs now (or joins the sync already running). Resolves to the player's id, or null if it failed. */
    run,
    deleteAccount,
  };
}
