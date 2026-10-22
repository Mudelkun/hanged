/*
 * Sends the player's stats and finished rounds to the server whenever it can.
 * The device is the source of truth; a failed sync changes nothing and the
 * next one sends the same reports again (the server skips seqs it has).
 *
 * The account (an anonymous id + secret from the server) is kept apart from
 * the game save, under its own key, and made on the first sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LIMITS, type PlayerSnapshot } from '../../server/src/contract';
import type { GameAction, GameState } from '../game/progress';
import { Account, api, ApiError } from './api';

const ACCOUNT_KEY = 'hanged.account.v1';

async function account(): Promise<Account> {
  const saved = await AsyncStorage.getItem(ACCOUNT_KEY).catch(() => null);
  if (saved) return JSON.parse(saved) as Account;
  const made = await api.register();
  await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(made));
  return made;
}

/** The player's id on the server, if a sync ever made one (no network needed). */
export async function savedPlayerId(): Promise<string | null> {
  const saved = await AsyncStorage.getItem(ACCOUNT_KEY).catch(() => null);
  return saved ? (JSON.parse(saved) as Account).id : null;
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
      const pending = s.reports.filter((r) => r.seq > acked);
      const reports = pending.slice(0, LIMITS.reportsPerSync);
      try {
        acked = (await api.sync(me, { player: snapshot(s), reports })).acked;
      } catch (e) {
        // The server doesn't know this player (e.g. its database was reset): start over next time.
        if (e instanceof ApiError && e.status === 401) await AsyncStorage.removeItem(ACCOUNT_KEY);
        throw e;
      }
      dispatch({ type: 'reportsSent', upTo: acked });
      if (pending.length <= reports.length) return me.id;
    }
  }

  return {
    update: (state: GameState | null) => {
      latest = state;
    },
    /** Syncs now (or joins the sync already running). Resolves to the player's id, or null if it failed. */
    run: (): Promise<string | null> =>
      (running ??= once()
        .catch(() => null)
        .finally(() => {
          running = null;
        })),
  };
}
