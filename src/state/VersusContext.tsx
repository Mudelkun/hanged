/*
 * Versus (online multiplayer) on the device: the live socket, the state the
 * server mirrors into it (src/state/versus.ts), and what the player can do.
 * The solo game never depends on any of it (offline first, CLAUDE.md).
 *
 * The socket is open only while it's useful, to keep the server cheap:
 *   - while a Versus screen is showing (useLiveWhileFocused),
 *   - while the player is in a queue, lobby or match,
 *   - and, once the player has opened Versus at least once, while the app is in
 *     the foreground, so a friend's invite reaches them on any screen.
 * In the background it closes; the server keeps a match waiting a while, and
 * the reconnect resumes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { ClientMessage, ModeId, ReportReason, ServerMessage } from '../../server/src/versus-contract';
import { needsOnboarding } from '../game/onboarding';
import { Account, api } from '../net/api';
import { createLive, LiveConn } from '../net/live';
import { versusAccount } from '../net/sync';
import { useGame } from './GameContext';
import { initialVersus, inRoom, versusReducer, VersusState } from './versus';

const SEEN_KEY = 'hanged.versus.v1';
const NOTICE_MS = 3_500;
const FRIENDS_REFRESH_MS = 150;

export interface VersusActions {
  queue: (mode: ModeId) => void;
  unqueue: () => void;
  host: (mode: ModeId) => void;
  join: (code: string) => void;
  leaveLobby: () => void;
  ready: (ready: boolean) => void;
  setMode: (mode: ModeId) => void;
  start: () => void;
  kick: (id: string) => void;
  invite: (id: string) => void;
  answer: (lobbyId: string, accept: boolean) => void;
  guess: (letter: string) => void;
  skip: () => void;
  pick: (choice: { card: number } | { word: string }) => void;
  forfeit: () => void;
  dismissResult: () => void;
}

interface VersusContextValue {
  state: VersusState;
  actions: VersusActions;
  /** The server's clock now (deadlines are on it). */
  serverNow: () => number;
  /** The account friends calls sign in with; null offline. */
  account: () => Promise<Account | null>;
  /** Asks the server whether Versus is on. false offline. */
  refreshStatus: () => Promise<boolean>;
  /** Keeps the socket open while held (a Versus screen is showing). */
  hold: () => () => void;
}

const VersusContext = createContext<VersusContextValue | null>(null);

export function VersusProvider({ children }: { children: ReactNode }) {
  const { state: game, ready, syncNow } = useGame();
  const [state, dispatch] = useReducer(versusReducer, initialVersus);
  const [holders, setHolders] = useState(0);
  const [seen, setSeen] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const onboarding = !ready || needsOnboarding(game);

  // syncNow never changes (GameContext makes it once), so neither does the account
  const account = useCallback(() => versusAccount(syncNow), [syncNow]);
  const [live] = useState(() => {
    const socket = createLive({
      account: () => versusAccount(syncNow),
      onMessage: (msg: ServerMessage) => {
        // The queue is re-sent after a reconnect only while the player is still waiting
        if (msg.t === 'match' || msg.t === 'unqueued' || msg.t === 'lobby' || (msg.t === 'error' && msg.code !== 'slow')) socket.remember(null);
        dispatch({ type: 'message', msg, at: Date.now() });
      },
      onConn: (conn: LiveConn) => dispatch({ type: 'conn', conn }),
    });
    return socket;
  });

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => setSeen(v === '1'), () => {});
    const sub = AppState.addEventListener('change', (s) => setForeground(s !== 'background'));
    return () => sub.remove();
  }, []);

  const room = inRoom(state);
  const off = state.status?.enabled === false && !state.match;
  const wanted = !onboarding && foreground && !off && (holders > 0 || seen || room);
  useEffect(() => {
    live.want(wanted);
    if (!wanted && !foreground) dispatch({ type: 'conn', conn: 'idle' });
  }, [live, wanted, foreground]);

  // A deleted account (the save starts over): nothing of it stays
  useEffect(() => {
    if (!onboarding) return;
    live.remember(null);
    dispatch({ type: 'reset' });
  }, [onboarding, live]);

  useEffect(() => {
    if (!state.notice) return;
    const id = setTimeout(() => dispatch({ type: 'clearNotice' }), NOTICE_MS);
    return () => clearTimeout(id);
  }, [state.notice]);

  const hold = useCallback(() => {
    setHolders((h) => h + 1);
    if (!seen) {
      setSeen(true);
      AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    }
    return () => setHolders((h) => h - 1);
  }, [seen]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.versusStatus();
      dispatch({ type: 'status', status });
      if (status.enabled) live.resume();
      return true;
    } catch {
      return false;
    }
  }, [live]);

  // Strictly increasing across app restarts too: the server judges a counter once and ignores older ones
  const counter = useRef(0);
  const nextN = () => (counter.current = Math.max(counter.current + 1, Date.now()));

  const language = game.language;
  const actions = useMemo<VersusActions>(() => {
    const send = (msg: ClientMessage) => live.send(msg);
    return {
      queue: (mode) => {
        live.remember({ t: 'queue', mode, language });
        send({ t: 'queue', mode, language });
      },
      unqueue: () => {
        live.remember(null);
        if (!send({ t: 'unqueue' })) dispatch({ type: 'message', msg: { t: 'unqueued' }, at: Date.now() });
      },
      host: (mode) => send({ t: 'host', mode, language }),
      join: (code) => send({ t: 'join', code: code.trim().toUpperCase() }),
      leaveLobby: () => {
        if (!send({ t: 'leaveLobby' })) dispatch({ type: 'message', msg: { t: 'lobbyGone', reason: 'left' }, at: Date.now() });
      },
      ready: (ready) => send({ t: 'ready', ready }),
      setMode: (mode) => send({ t: 'mode', mode }),
      start: () => send({ t: 'start' }),
      kick: (id) => send({ t: 'kick', id }),
      invite: (id) => send({ t: 'invite', id }),
      answer: (lobbyId, accept) => {
        send({ t: 'answer', lobbyId, accept });
        dispatch({ type: 'message', msg: { t: 'inviteGone', lobbyId }, at: Date.now() });
      },
      guess: (letter) => {
        const n = nextN();
        if (send({ t: 'guess', n, letter })) dispatch({ type: 'guessSent', n, letter });
      },
      skip: () => send({ t: 'skip', n: nextN() }),
      pick: (choice) => {
        if (send({ t: 'pick', n: nextN(), ...choice })) dispatch({ type: 'pickSent' });
      },
      forfeit: () => {
        send({ t: 'forfeit' });
        dispatch({ type: 'forfeited' });
      },
      dismissResult: () => {
        send({ t: 'dismiss' });
        dispatch({ type: 'dismissResult' });
      },
    };
  }, [live, language]);

  const serverNow = useCallback(() => Date.now() + state.offset, [state.offset]);

  const value = useMemo(
    () => ({ state, actions, serverNow, account, refreshStatus, hold }),
    [state, actions, serverNow, account, refreshStatus, hold],
  );
  return <VersusContext.Provider value={value}>{children}</VersusContext.Provider>;
}

export function useVersus() {
  const ctx = useContext(VersusContext);
  if (!ctx) throw new Error('useVersus must be used inside <VersusProvider>');
  return ctx;
}

/** Keeps the live socket open while the calling screen is in view. */
export function useLiveWhileFocused() {
  const { hold } = useVersus();
  useFocusEffect(hold);
}

/**
 * The friends lists (REST), fetched when the screen shows and again whenever
 * the server says they changed. Presence comes live from the socket on top.
 */
export function useFriends() {
  const { state, account } = useVersus();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.friends>> | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const me = await account();
    if (!me) return setFailed(true);
    try {
      setData(await api.friends(me));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [account]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  // The server says they changed: fetch them, once for a burst of changes
  const version = state.friendsVersion;
  useEffect(() => {
    if (!version) return;
    const id = setTimeout(load, FRIENDS_REFRESH_MS);
    return () => clearTimeout(id);
  }, [version, load]);

  /** Runs a change, then fetches the lists again. false when it didn't go through. */
  const act = useCallback(
    async (fn: (me: Account) => Promise<unknown>) => {
      const me = await account();
      if (!me) return false;
      try {
        await fn(me);
        await load();
        return true;
      } catch {
        return false;
      }
    },
    [account, load],
  );

  const friends = useMemo(
    () => data?.friends.map((f) => ({ ...f, presence: state.presence[f.id] ?? f.presence })) ?? [],
    [data, state.presence],
  );

  /** Players whose name starts with `q`; null offline. */
  const search = useCallback(
    async (q: string) => {
      const me = await account();
      if (!me) return null;
      try {
        return (await api.search(me, q)).players;
      } catch {
        return null;
      }
    },
    [account],
  );

  return {
    data,
    friends,
    failed,
    reload: load,
    request: (id: string) => act((me) => api.requestFriend(me, id)),
    accept: (id: string) => act((me) => api.acceptFriend(me, id)),
    dropRequest: (id: string) => act((me) => api.dropRequest(me, id)),
    remove: (id: string) => act((me) => api.removeFriend(me, id)),
    block: (id: string) => act((me) => api.block(me, id)),
    unblock: (id: string) => act((me) => api.unblock(me, id)),
    report: (id: string, reason: ReportReason) => act((me) => api.report(me, id, reason)),
    search,
  };
}
