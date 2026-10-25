/*
 * Versus as the app holds it: what the server last said (the server is the
 * referee; this only mirrors it), plus what's in flight from this device.
 * A pure reducer over the socket's messages (server/src/versus-contract.ts),
 * so every message's effect is tested without a socket.
 */
import type {
  ByeReason,
  ErrorCode,
  InviteView,
  LobbyGone,
  LobbyView,
  MatchResult,
  MatchView,
  ModeId,
  PlayerCard,
  Presence,
  ServerMessage,
  VersusStats,
  VersusStatus,
  WordDone,
} from '../../server/src/versus-contract';
import type { LiveConn } from '../net/live';

/** Something to tell the player once (a toast). */
export type Notice =
  | { kind: 'error'; code: ErrorCode }
  | { kind: 'declined'; name: string | null }
  | { kind: 'lobbyGone'; reason: LobbyGone }
  /** The match ended (or the server restarted) while this device was away. */
  | { kind: 'matchLost' };

/**
 * How a friend invite link went (a banner over any screen): friends with
 * `player`, either way (I followed their link, or they followed mine), or why
 * the link didn't work: it's my own, it's gone, or a friends list is full.
 */
export type FriendNote = { kind: 'friends'; player: PlayerCard } | { kind: 'own' | 'gone' | 'full' };

export interface VersusState {
  conn: LiveConn | 'idle';
  /** The server ended the session for good (until asked again). */
  closed: ByeReason | null;
  me: string | null;
  /** The server's clock minus this device's: deadlines are on the server's clock. */
  offset: number;
  status: VersusStatus | null;
  stats: VersusStats | null;
  queue: { mode: ModeId; since: number } | null;
  lobby: LobbyView | null;
  match: MatchView | null;
  result: MatchResult | null;
  /** Letters sent and not judged yet, by the counter they were sent with. */
  pending: { n: number; letter: string }[];
  /** The word that just finished (the screen flashes it); `at` is this device's clock. */
  flash: (WordDone & { at: number }) | null;
  /** Balloon Battle: the last hit, for its animation. */
  hit: { from: string; to: string; count: number; at: number } | null;
  /** Word Duel: a pick on its way, or why the last one was refused. */
  pick: { sending: boolean; error: ErrorCode | null };
  invites: InviteView[];
  presence: Record<string, Presence>;
  /** Bumped when the server says the friends lists changed: they're fetched again. */
  friendsVersion: number;
  notice: (Notice & { at: number }) | null;
  friendNote: (FriendNote & { at: number }) | null;
}

export const initialVersus: VersusState = {
  conn: 'idle',
  closed: null,
  me: null,
  offset: 0,
  status: null,
  stats: null,
  queue: null,
  lobby: null,
  match: null,
  result: null,
  pending: [],
  flash: null,
  hit: null,
  pick: { sending: false, error: null },
  invites: [],
  presence: {},
  friendsVersion: 0,
  notice: null,
  friendNote: null,
};

export type VersusAction =
  | { type: 'conn'; conn: LiveConn | 'idle' }
  /** `at`: this device's clock when it arrived. */
  | { type: 'message'; msg: ServerMessage; at: number }
  | { type: 'status'; status: VersusStatus }
  | { type: 'guessSent'; n: number; letter: string }
  | { type: 'pickSent' }
  /** Left the match on purpose: it's gone from this device at once. */
  | { type: 'forfeited' }
  | { type: 'dismissResult' }
  | { type: 'clearNotice' }
  | { type: 'friendNote'; note: FriendNote | null; at: number }
  | { type: 'reset' };

const withPlayer = (match: MatchView | null, player: MatchView['players'][number]): MatchView | null =>
  match && { ...match, players: match.players.map((p) => (p.id === player.id ? player : p)) };

function receive(s: VersusState, msg: ServerMessage, at: number): VersusState {
  const notice = (n: Notice): VersusState['notice'] => ({ ...n, at });
  switch (msg.t) {
    case 'hello':
      return {
        ...s,
        closed: null,
        me: msg.me,
        offset: msg.now - at,
        status: msg.status,
        stats: msg.stats,
        // The server drops a queue with the socket, and the app queues again at once (live.ts
        // `remember`), so it stays unless that can't happen; a match or lobby the server still has comes next
        queue: msg.status.enabled && !msg.inMatch ? s.queue : null,
        match: msg.inMatch ? s.match : null,
        lobby: msg.inLobby ? s.lobby : null,
        pending: [],
        notice: s.match && !msg.inMatch && !s.result ? notice({ kind: 'matchLost' }) : s.notice,
      };
    case 'status':
      return msg.status.enabled ? { ...s, status: msg.status } : { ...s, status: msg.status, queue: null, lobby: null, invites: [] };
    case 'stats':
      return { ...s, stats: msg.stats };
    case 'presence':
      return { ...s, presence: { ...s.presence, [msg.id]: msg.presence } };
    case 'friends':
      return { ...s, friendsVersion: s.friendsVersion + 1 };
    case 'friendAdded':
      return { ...s, friendNote: { kind: 'friends', player: msg.by, at } };
    case 'invite':
      return { ...s, invites: [...s.invites.filter((i) => i.lobbyId !== msg.invite.lobbyId), msg.invite] };
    case 'inviteGone':
      return { ...s, invites: s.invites.filter((i) => i.lobbyId !== msg.lobbyId) };
    case 'declined':
      return { ...s, notice: notice({ kind: 'declined', name: msg.by.name }) };
    case 'queued':
      return { ...s, queue: { mode: msg.mode, since: msg.since }, result: null };
    case 'unqueued':
      return { ...s, queue: null };
    case 'lobby':
      return { ...s, lobby: msg.lobby, queue: null };
    case 'lobbyGone':
      return { ...s, lobby: null, notice: msg.reason === 'left' ? s.notice : notice({ kind: 'lobbyGone', reason: msg.reason }) };
    case 'match': {
      const fresh = s.match?.id !== msg.match.id;
      return {
        ...s,
        match: msg.match,
        offset: msg.now - at,
        queue: null,
        result: fresh ? null : s.result,
        pending: fresh ? [] : s.pending,
        flash: fresh ? null : s.flash,
        hit: fresh ? null : s.hit,
        // A pick still on its way survives a snapshot of the same pick phase
        pick: !fresh && msg.match.phase === 'pick' && !msg.match.picked ? s.pick : { sending: false, error: null },
      };
    }
    case 'player':
      return { ...s, match: withPlayer(s.match, msg.player) };
    case 'puzzle':
      return {
        ...s,
        match: s.match && { ...s.match, you: msg.puzzle },
        pending: msg.n === undefined ? s.pending : s.pending.filter((p) => p.n > msg.n!),
        flash: msg.done ? { ...msg.done, at } : s.flash,
      };
    case 'hit':
      return { ...s, hit: { from: msg.from, to: msg.to, count: msg.count, at } };
    case 'picked':
      return { ...s, pick: { sending: false, error: msg.ok ? null : (msg.error ?? 'bad') } };
    case 'end':
      return { ...s, result: msg.result, match: null, pending: [], flash: null, hit: null };
    case 'error':
      return { ...s, notice: notice({ kind: 'error', code: msg.code }), pick: s.pick.sending ? { sending: false, error: msg.code } : s.pick };
    case 'bye':
      return msg.reason === 'restart' ? s : { ...s, closed: msg.reason, queue: null };
    default:
      // A newer server's message this app doesn't know yet
      return s;
  }
}

export function versusReducer(s: VersusState, a: VersusAction): VersusState {
  switch (a.type) {
    case 'conn':
      return { ...s, conn: a.conn, pending: a.conn === 'online' ? s.pending : [] };
    case 'message':
      return receive(s, a.msg, a.at);
    case 'status':
      return { ...s, status: a.status, closed: a.status.enabled && s.closed === 'disabled' ? null : s.closed };
    case 'guessSent':
      return { ...s, pending: [...s.pending, { n: a.n, letter: a.letter }] };
    case 'pickSent':
      return { ...s, pick: { sending: true, error: null } };
    case 'forfeited':
      return { ...s, match: null, pending: [], flash: null, hit: null };
    case 'dismissResult':
      return { ...s, result: null };
    case 'clearNotice':
      return { ...s, notice: null };
    case 'friendNote':
      return { ...s, friendNote: a.note && { ...a.note, at: a.at } };
    case 'reset':
      return initialVersus;
  }
}

/** The server's clock now. */
export const serverNow = (s: Pick<VersusState, 'offset'>, deviceNow: number) => deviceNow + s.offset;

/** Whether the player is somewhere the live room screen shows (queue, lobby, match or its result). */
export const inRoom = (s: VersusState) => !!(s.queue || s.lobby || s.match || s.result);
