/*
 * The leaderboard, the one screen that needs the internet. Each time it
 * shows (or the period changes, or the player pulls to refresh) it syncs
 * first, so the player's own row counts their latest words, then fetches.
 * Each period keeps its last board, so a later failure still shows it.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { LeaderboardResponse, Period } from '../../server/src/contract';
import { api } from '../net/api';
import { savedPlayerId } from '../net/sync';
import { useGame } from './GameContext';
import { useSoundScope } from '../audio/AudioProvider';

export interface Board extends LeaderboardResponse {
  /** This device's player id, to find their row. */
  meId: string | null;
}

export type BoardView = { status: 'loading' } | { status: 'offline' } | { status: 'ready'; board: Board };

export function useLeaderboard(period: Period) {
  const audio = useSoundScope();
  const { syncNow } = useGame();
  const [boards, setBoards] = useState<Partial<Record<Period, Board>>>({});
  const [failed, setFailed] = useState<Partial<Record<Period, boolean>>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (p: Period) => {
      const meId = (await syncNow()) ?? (await savedPlayerId());
      try {
        const board = { ...(await api.leaderboard(p, meId ?? undefined)), meId };
        setBoards((all) => ({ ...all, [p]: board }));
        setFailed((all) => ({ ...all, [p]: false }));
        return true;
      } catch {
        setFailed((all) => ({ ...all, [p]: true }));
        return false;
      }
    },
    [syncNow],
  );

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [load, period]),
  );

  const refresh = useCallback(async () => {
    if (refreshing) return;
    const stillCurrent = audio.continuation();
    audio.play('refresh');
    setRefreshing(true);
    const succeeded = await load(period);
    if (stillCurrent()) audio.play(succeeded ? 'board-ready' : 'offline');
    setRefreshing(false);
  }, [load, period, refreshing, audio]);

  const board = boards[period];
  const view: BoardView = board ? { status: 'ready', board } : failed[period] ? { status: 'offline' } : { status: 'loading' };
  return { view, refreshing, refresh };
}
