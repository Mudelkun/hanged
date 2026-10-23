/*
 * The Versus hub: every live connection, lobby, queue and match of this
 * server, in memory. One Node process holds tens of thousands of idle
 * sockets and thousands of matches (a guess is one small message, judged in
 * microseconds), so one small instance carries Versus a long way; the way
 * out when it doesn't is in Context/versus.md.
 *
 * Socket life:
 *  1. The app opens GET /v1/live and must send `auth` within AUTH_MS.
 *  2. `hello` answers with the switch, the player's stats, and whatever they
 *     were in (match, lobby, unseen result), so a reconnect resumes in one message.
 *  3. Every message is rate limited (token bucket) and shape-checked.
 *  4. A ping every HEARTBEAT_MS; no pong by the next one closes the socket.
 *  5. One socket per player: a second one (another device, a reconnect that
 *     beat the old socket's close) replaces the first.
 *
 * Costs: the database is read at sign-in (player, friends, blocks) and
 * written when something lasting changes (a match result, a friendship).
 * Nothing per guess, nothing per tick; timers exist only while something waits.
 */
import type { WebSocket } from 'ws';

import type { Db } from '../db.ts';
import { isLanguage } from '../languages.ts';
import {
  type ClientMessage,
  type ErrorCode,
  type InviteView,
  MODE_IDS,
  MODES,
  type MatchResult,
  type ModeId,
  type Presence,
  type ServerMessage,
  VERSUS_LIMITS,
  VERSUS_PROTOCOL,
  type VersusStatus,
} from '../versus-contract.ts';
import { type LobbyError, type Lobby, Lobbies } from './lobbies.ts';
import { type Clock, createMatch, type Match, type MatchHost, type Seat } from './match.ts';
import { Matchmaker } from './matchmaker.ts';
import { blockIds, friendIds, saveResult, stats, type VersusPlayer, versusPlayer } from './store.ts';
import type { WordSource } from './words.ts';

const AUTH_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const TICK_MS = 1_000;
/** A result is kept this long for a player who wasn't there to see it. */
const RESULT_KEPT_MS = 10 * 60_000;
/** Rate-limit strikes before the socket is closed for abuse. */
const MAX_STRIKES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Conn {
  ws: WebSocket;
  player: VersusPlayer;
  friends: Set<string>;
  blocks: Set<string>;
  tokens: number;
  refilledAt: number;
  strikes: number;
  alive: boolean;
}

interface Invite {
  view: InviteView;
  inviter: string;
  cancel: () => void;
}

export interface HubOptions {
  db: Db;
  words: WordSource;
  status: VersusStatus;
  clock?: Clock;
  rng?: () => number;
  log?: { warn(o: object, msg: string): void; error(o: object, msg: string): void };
}

const realClock: Clock = {
  now: () => Date.now(),
  later: (ms, fn) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

export class Hub {
  status: VersusStatus;
  private readonly db: Db;
  private readonly words: WordSource;
  private readonly clock: Clock;
  private readonly log: HubOptions['log'];
  private readonly conns = new Map<string, Conn>();
  private readonly matches = new Set<Match>();
  private readonly matchOf = new Map<string, Match>();
  private readonly lobbyOfMatch = new Map<Match, Lobby>();
  private readonly results = new Map<string, { result: MatchResult; at: number }>();
  private readonly lobbies = new Lobbies();
  private readonly queue: Matchmaker;
  private readonly invites = new Map<string, Map<string, Invite>>();
  private readonly matchHost: MatchHost;
  private ticking: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(opts: HubOptions) {
    this.db = opts.db;
    this.words = opts.words;
    this.status = opts.status;
    this.clock = opts.clock ?? realClock;
    this.log = opts.log;
    this.queue = new Matchmaker((a, b) => this.blocked(a, b));
    this.matchHost = {
      clock: this.clock,
      rng: opts.rng ?? Math.random,
      words: this.words,
      send: (id, msg) => this.send(id, msg),
      left: (match, id) => this.released(match, id),
      ended: (match, result) => this.ended(match, result),
    };
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  // ---- sockets ----

  /** A new socket: it has AUTH_MS to say who it is. */
  attach(ws: WebSocket) {
    let conn: Conn | null = null;
    let signingIn = false;
    const deadline = setTimeout(() => ws.close(4001, 'auth'), AUTH_MS);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return ws.close(4000, 'bad');
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return ws.close(4000, 'bad');
      }
      if (conn) return this.receive(conn, msg);
      // Anything sent before the sign-in finishes is dropped: the app waits for hello
      if (signingIn) return;
      if (msg?.t !== 'auth') return ws.close(4001, 'auth');
      clearTimeout(deadline);
      signingIn = true;
      this.signIn(ws, msg).then(
        (c) => {
          conn = c;
        },
        (e) => {
          this.log?.error({ err: e }, 'versus sign-in failed');
          ws.close(1011, 'error');
        },
      );
    });
    ws.on('pong', () => {
      if (conn) conn.alive = true;
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      if (conn) this.gone(conn);
    });
    ws.on('error', () => ws.terminate());
  }

  private async signIn(ws: WebSocket, msg: Extract<ClientMessage, { t: 'auth' }>): Promise<Conn | null> {
    if (msg.v !== VERSUS_PROTOCOL) return this.bye(ws, 'version');
    if (typeof msg.id !== 'string' || !UUID.test(msg.id) || typeof msg.secret !== 'string' || msg.secret.length > 100) return this.bye(ws, 'auth');
    const player = await versusPlayer(this.db, { id: msg.id, secret: msg.secret });
    if (!player) return this.bye(ws, 'auth');
    if (ws.readyState !== ws.OPEN) return null;
    const [friends, blocks] = await Promise.all([friendIds(this.db, player.id), blockIds(this.db, player.id)]);
    const id = player.id;

    // One socket per player: the newest wins
    const old = this.conns.get(id);
    if (old) {
      this.conns.delete(id);
      this.bye(old.ws, 'elsewhere');
    }
    const conn: Conn = { ws, player, friends: new Set(friends), blocks: new Set(blocks), tokens: VERSUS_LIMITS.burst, refilledAt: this.clock.now(), strikes: 0, alive: true };
    const match = this.matchOf.get(id);
    const lobby = this.lobbies.find(id);
    lobby?.grace.get(id)?.();
    lobby?.grace.delete(id);
    this.conns.set(id, conn);
    this.raw(conn, {
      t: 'hello',
      me: id,
      now: this.clock.now(),
      status: this.status,
      stats: { rating: player.rating, played: player.played, won: player.won },
      inMatch: !!match,
      inLobby: !!lobby,
    });
    // Off: only a player finishing a match stays
    if (!this.status.enabled && !match) {
      this.bye(ws, 'disabled');
      return null;
    }
    if (match) match.back(id);
    else {
      const kept = this.results.get(id);
      if (kept) this.raw(conn, { t: 'end', result: kept.result });
    }
    if (lobby) this.raw(conn, { t: 'lobby', lobby: this.lobbies.view(lobby) });
    for (const invite of this.invites.get(id)?.values() ?? []) this.raw(conn, { t: 'invite', invite: invite.view });
    if (!old) this.announce(id);
    return conn;
  }

  /** The socket closed. A match or a lobby waits a while for them; the queue doesn't. */
  private gone(conn: Conn) {
    const id = conn.player.id;
    if (this.conns.get(id) !== conn) return;
    this.conns.delete(id);
    this.queue.leave(id);
    this.matchOf.get(id)?.away(id);
    const lobby = this.lobbies.find(id);
    if (lobby && !lobby.playing && !lobby.grace.has(id))
      lobby.grace.set(id, this.clock.later(VERSUS_LIMITS.lobbyGraceMs, () => this.leaveLobby(id, 'left')));
    this.announce(id);
  }

  private beat() {
    for (const conn of this.conns.values()) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
    const old = this.clock.now() - RESULT_KEPT_MS;
    for (const [id, kept] of this.results) if (kept.at < old) this.results.delete(id);
  }

  private bye(ws: WebSocket, reason: Extract<ServerMessage, { t: 'bye' }>['reason']): null {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ t: 'bye', reason } satisfies ServerMessage));
      ws.close(4002, reason);
    }
    return null;
  }

  private raw(conn: Conn, msg: ServerMessage) {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  send(id: string, msg: ServerMessage) {
    const conn = this.conns.get(id);
    if (conn) this.raw(conn, msg);
  }

  // ---- messages ----

  /** Token bucket: a burst, then a steady rate. Way over it, the socket goes. */
  private allowed(conn: Conn): boolean {
    const now = this.clock.now();
    conn.tokens = Math.min(VERSUS_LIMITS.burst, conn.tokens + ((now - conn.refilledAt) / 1000) * VERSUS_LIMITS.perSecond);
    conn.refilledAt = now;
    if (conn.tokens >= 1) {
      conn.tokens--;
      return true;
    }
    if (++conn.strikes > MAX_STRIKES) this.bye(conn.ws, 'abuse');
    else if (conn.strikes % 10 === 1) this.raw(conn, { t: 'error', code: 'slow' });
    return false;
  }

  private receive(conn: Conn, msg: ClientMessage) {
    conn.alive = true;
    if (!this.allowed(conn)) return;
    const id = conn.player.id;
    const fail = (code: ErrorCode) => this.raw(conn, { t: 'error', code });
    const n = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
    const mode = (v: unknown): v is ModeId => MODE_IDS.includes(v as ModeId);
    switch (msg?.t) {
      case 'guess':
        if (!n(msg.n) || typeof msg.letter !== 'string' || msg.letter.length > 2) return fail('bad');
        return this.matchOf.get(id)?.guess(id, msg.n, msg.letter);
      case 'skip':
        if (!n(msg.n)) return fail('bad');
        return this.matchOf.get(id)?.skip(id, msg.n);
      case 'pick':
        if (!n(msg.n) || (msg.card !== undefined && !Number.isInteger(msg.card)) || (msg.word !== undefined && (typeof msg.word !== 'string' || msg.word.length > 40))) return fail('bad');
        return this.matchOf.get(id)?.pick(id, msg.n, msg.card, msg.word);
      case 'forfeit':
        return this.forfeit(id);
      case 'dismiss':
        this.results.delete(id);
        return;
      case 'queue':
        if (!mode(msg.mode) || !isLanguage(msg.language)) return fail('bad');
        return this.enqueue(conn, msg.mode, msg.language);
      case 'unqueue':
        this.queue.leave(id);
        this.ensureTicking();
        return this.raw(conn, { t: 'unqueued' });
      case 'host':
        if (!mode(msg.mode) || !isLanguage(msg.language)) return fail('bad');
        return this.host(conn, msg.mode, msg.language);
      case 'join':
        if (typeof msg.code !== 'string' || msg.code.length !== VERSUS_LIMITS.codeLength) return fail('noLobby');
        return this.join(conn, this.lobbies.byCodeOf(msg.code));
      case 'leaveLobby':
        return this.leaveLobby(id, 'left');
      case 'ready': {
        const lobby = this.lobbies.find(id);
        if (!lobby) return fail('noLobby');
        this.lobbies.setReady(lobby, id, !!msg.ready);
        return this.lobbyChanged(lobby);
      }
      case 'mode': {
        const lobby = this.lobbies.find(id);
        if (!lobby) return fail('noLobby');
        if (!mode(msg.mode)) return fail('bad');
        const error = this.lobbies.setMode(lobby, id, msg.mode);
        return error ? fail(error) : this.lobbyChanged(lobby);
      }
      case 'start':
        return this.startLobby(conn);
      case 'kick': {
        const lobby = this.lobbies.find(id);
        if (!lobby || lobby.hostId !== id) return fail('notHost');
        if (typeof msg.id !== 'string' || msg.id === id || this.lobbies.find(msg.id) !== lobby) return fail('bad');
        return this.leaveLobby(msg.id, 'kicked');
      }
      case 'invite':
        if (typeof msg.id !== 'string') return fail('bad');
        return this.invite(conn, msg.id);
      case 'answer':
        if (typeof msg.lobbyId !== 'string') return fail('bad');
        return this.answer(conn, msg.lobbyId, !!msg.accept);
      default:
        return fail('bad');
    }
  }

  /** Off, or the server is going down for an update: nothing new starts. */
  private closedToNew(conn: Conn): boolean {
    if (this.status.enabled && !this.draining) return false;
    this.raw(conn, { t: 'error', code: 'disabled' });
    return true;
  }

  private busy(id: string) {
    return this.matchOf.has(id);
  }

  // ---- matchmaking ----

  private enqueue(conn: Conn, mode: ModeId, language: string) {
    const id = conn.player.id;
    if (this.closedToNew(conn)) return;
    if (this.busy(id)) return this.raw(conn, { t: 'error', code: 'busy' });
    if (!this.words.has(language)) return this.raw(conn, { t: 'error', code: 'noWords' });
    if (this.lobbies.find(id)) this.leaveLobby(id, 'left');
    const since = this.clock.now();
    this.queue.join(mode, language, { id, rating: conn.player.rating, since });
    this.raw(conn, { t: 'queued', mode, since });
    this.ensureTicking();
  }

  /** The matchmaking timer runs only while someone is waiting. */
  private ensureTicking() {
    if (this.queue.size && !this.ticking) {
      this.ticking = setInterval(() => this.tick(), TICK_MS);
      this.ticking.unref();
    } else if (!this.queue.size && this.ticking) {
      clearInterval(this.ticking);
      this.ticking = null;
    }
  }

  tick() {
    for (const group of this.queue.tick(this.clock.now())) {
      const conns = group.ids.map((id) => this.conns.get(id));
      if (conns.some((c) => !c)) {
        // Someone vanished between ticks: the others wait on, with their place in line
        for (const c of conns) if (c) this.queue.join(group.mode, group.language, { id: c.player.id, rating: c.player.rating, since: this.clock.now() });
        continue;
      }
      this.startMatch(group.mode, group.language, conns.map((c) => this.seat(c!)), true);
    }
    this.ensureTicking();
  }

  private seat(conn: Conn): Seat {
    const { id, name, characterId, rating } = conn.player;
    return { id, name, characterId, rating };
  }

  // ---- lobbies and invites ----

  private member(conn: Conn) {
    const { id, name, characterId, rating } = conn.player;
    return { id, name, characterId, rating };
  }

  private host(conn: Conn, mode: ModeId, language: string) {
    const id = conn.player.id;
    if (this.closedToNew(conn)) return;
    if (this.busy(id)) return this.raw(conn, { t: 'error', code: 'busy' });
    this.queue.leave(id);
    if (this.lobbies.find(id)) this.leaveLobby(id, 'left');
    const lobby = this.lobbies.create(this.member(conn), mode, language);
    this.lobbyChanged(lobby);
  }

  private join(conn: Conn, lobby: Lobby | undefined) {
    const id = conn.player.id;
    if (this.closedToNew(conn)) return;
    if (this.busy(id)) return this.raw(conn, { t: 'error', code: 'busy' });
    const current = this.lobbies.find(id);
    if (current && current === lobby) return this.lobbyChanged(lobby);
    if (current) this.leaveLobby(id, 'left');
    this.queue.leave(id);
    const joined = this.lobbies.join(lobby, this.member(conn), (a, b) => this.blocked(a, b));
    if (typeof joined === 'string') return this.raw(conn, { t: 'error', code: joined });
    this.dropInvite(id, joined.id);
    this.lobbyChanged(joined);
  }

  private leaveLobby(id: string, reason: 'left' | 'kicked') {
    const out = this.lobbies.leave(id);
    if (!out) return;
    this.send(id, { t: 'lobbyGone', reason });
    if (out.closed) this.dropInvites(out.lobby.id);
    else this.lobbyChanged(out.lobby);
  }

  private lobbyChanged(lobby: Lobby) {
    const view = this.lobbies.view(lobby);
    for (const m of lobby.members) this.send(m.id, { t: 'lobby', lobby: view });
  }

  private startLobby(conn: Conn) {
    const id = conn.player.id;
    const lobby = this.lobbies.find(id);
    if (!lobby) return this.raw(conn, { t: 'error', code: 'noLobby' });
    if (this.closedToNew(conn)) return;
    const error: LobbyError | null = this.lobbies.canStart(lobby, id);
    if (error) return this.raw(conn, { t: 'error', code: error });
    if (!this.words.has(lobby.language)) return this.raw(conn, { t: 'error', code: 'noWords' });
    const seats = lobby.members.map((m) => this.conns.get(m.id)).filter((c): c is Conn => !!c && !this.busy(c.player.id)).map((c) => this.seat(c));
    if (seats.length < MODES[lobby.mode].minPlayers) return this.raw(conn, { t: 'error', code: 'notReady' });
    lobby.playing = true;
    this.dropInvites(lobby.id);
    this.lobbyChanged(lobby);
    const match = this.startMatch(lobby.mode, lobby.language, seats, false);
    this.lobbyOfMatch.set(match, lobby);
  }

  private invite(conn: Conn, to: string) {
    const id = conn.player.id;
    if (this.closedToNew(conn)) return;
    const lobby = this.lobbies.find(id);
    if (!lobby || lobby.playing) return this.raw(conn, { t: 'error', code: 'noLobby' });
    if (!conn.friends.has(to)) return this.raw(conn, { t: 'error', code: 'notFriend' });
    if (!this.conns.has(to)) return this.raw(conn, { t: 'error', code: 'offline' });
    if (this.busy(to)) return this.raw(conn, { t: 'error', code: 'busy' });
    if (lobby.members.length >= MODES[lobby.mode].maxPlayers) return this.raw(conn, { t: 'error', code: 'full' });
    if (lobby.members.some((m) => m.id === to)) return;
    this.dropInvite(to, lobby.id);
    const view: InviteView = {
      lobbyId: lobby.id,
      from: { id, name: conn.player.name, characterId: conn.player.characterId },
      mode: lobby.mode,
      expiresAt: this.clock.now() + VERSUS_LIMITS.inviteTtlMs,
    };
    const cancel = this.clock.later(VERSUS_LIMITS.inviteTtlMs, () => this.dropInvite(to, lobby.id));
    const mine = this.invites.get(to) ?? new Map<string, Invite>();
    mine.set(lobby.id, { view, inviter: id, cancel });
    this.invites.set(to, mine);
    this.send(to, { t: 'invite', invite: view });
  }

  private answer(conn: Conn, lobbyId: string, accept: boolean) {
    const id = conn.player.id;
    const invite = this.invites.get(id)?.get(lobbyId);
    this.dropInvite(id, lobbyId);
    if (!invite) return this.raw(conn, { t: 'error', code: 'noLobby' });
    if (accept) return this.join(conn, this.lobbies.get(lobbyId));
    const { name, characterId } = conn.player;
    this.send(invite.inviter, { t: 'declined', by: { id, name, characterId } });
  }

  /** The invite is gone (answered, expired, lobby closed): the invitee's banner goes too. */
  private dropInvite(to: string, lobbyId: string) {
    const mine = this.invites.get(to);
    const invite = mine?.get(lobbyId);
    if (!invite) return;
    invite.cancel();
    mine!.delete(lobbyId);
    if (!mine!.size) this.invites.delete(to);
    this.send(to, { t: 'inviteGone', lobbyId });
  }

  private dropInvites(lobbyId: string) {
    for (const to of [...this.invites.keys()]) this.dropInvite(to, lobbyId);
  }

  // ---- matches ----

  private startMatch(mode: ModeId, language: string, seats: Seat[], ranked: boolean): Match {
    const match = createMatch(this.matchHost, mode, seats, ranked, language);
    this.matches.add(match);
    for (const s of seats) {
      this.matchOf.set(s.id, match);
      this.results.delete(s.id);
      this.queue.leave(s.id);
      for (const lobbyId of [...(this.invites.get(s.id)?.keys() ?? [])]) this.dropInvite(s.id, lobbyId);
      this.announce(s.id);
    }
    match.start();
    return match;
  }

  /** Left on purpose: the match goes on without them. */
  private forfeit(id: string) {
    this.matchOf.get(id)?.forfeit(id);
  }

  /**
   * Out of the match (left, or away too long): free at once for something
   * else, and out of the friend lobby it came from (a lobby can't wait on them).
   */
  private released(match: Match, id: string) {
    if (this.matchOf.get(id) !== match) return;
    this.matchOf.delete(id);
    const lobby = this.lobbyOfMatch.get(match);
    if (lobby && this.lobbies.find(id) === lobby) this.leaveLobby(id, 'left');
    this.announce(id);
  }

  private ended(match: Match, result: MatchResult) {
    this.matches.delete(match);
    const at = this.clock.now();
    for (const id of match.playerIds) {
      if (this.matchOf.get(id) !== match) continue;
      this.matchOf.delete(id);
      this.results.set(id, { result, at });
      this.send(id, { t: 'end', result });
      this.announce(id);
    }
    const lobby = this.lobbyOfMatch.get(match);
    this.lobbyOfMatch.delete(match);
    if (lobby && this.lobbies.get(lobby.id) === lobby) {
      // Rematch: the lobby is back, without whoever left or isn't connected any more
      for (const m of [...lobby.members]) if (!this.conns.has(m.id) || result.standings.find((s) => s.id === m.id)?.left) this.leaveLobby(m.id, 'left');
      if (this.lobbies.get(lobby.id)) {
        this.lobbies.rematch(lobby);
        if (this.status.enabled) this.lobbyChanged(lobby);
        else this.closeLobby(lobby);
      }
    }
    // Off while it was played: its players go now
    if (!this.status.enabled) for (const id of match.playerIds) this.dismissIdle(id);
    saveResult(this.db, result)
      .then(() => this.refreshStats(result.standings.map((s) => s.id)))
      .catch((err) => this.log?.error({ err, matchId: result.matchId }, 'versus result not saved'));
  }

  private async refreshStats(ids: string[]) {
    for (const id of ids) {
      const conn = this.conns.get(id);
      if (!conn) continue;
      const s = await stats(this.db, id);
      conn.player = { ...conn.player, ...s };
      this.raw(conn, { t: 'stats', stats: s });
    }
  }

  // ---- presence, friends, blocks ----

  presence(id: string): Presence {
    return !this.conns.has(id) ? 'offline' : this.matchOf.has(id) ? 'playing' : 'online';
  }

  /** Tells the player's online friends where they are now. */
  private announce(id: string) {
    const conn = this.conns.get(id);
    const presence = this.presence(id);
    // Offline: their socket is gone, so look the friends up from the friends' side
    const friends = conn ? conn.friends : [...this.conns.values()].filter((c) => c.friends.has(id)).map((c) => c.player.id);
    for (const f of friends) this.send(f, { t: 'presence', id, presence });
  }

  private blocked(a: string, b: string) {
    return !!(this.conns.get(a)?.blocks.has(b) || this.conns.get(b)?.blocks.has(a));
  }

  /** Friendships changed in the database (REST): keep the sockets' copies in step, and tell both. */
  friendsChanged(a: string, b: string, friends: boolean) {
    for (const [x, y] of [[a, b], [b, a]]) {
      const conn = this.conns.get(x);
      if (!conn) continue;
      if (friends) conn.friends.add(y);
      else conn.friends.delete(y);
      this.raw(conn, { t: 'friends' });
      if (friends) this.raw(conn, { t: 'presence', id: y, presence: this.presence(y) });
    }
  }

  /** A request arrived or went: their lists need fetching again. */
  requestsChanged(...ids: string[]) {
    for (const id of ids) this.send(id, { t: 'friends' });
  }

  blockChanged(a: string, b: string, blocked: boolean) {
    for (const [x, y] of [[a, b], [b, a]]) {
      const conn = this.conns.get(x);
      if (!conn) continue;
      if (blocked) conn.blocks.add(y);
      else conn.blocks.delete(y);
    }
    if (blocked) this.friendsChanged(a, b, false);
  }

  // ---- the switch, draining, admin ----

  /**
   * The kill switch. Off: queues, lobbies and invites close at once, and the
   * sockets of players not in a match close; matches finish (or stop, with
   * endMatches, and count for nothing).
   */
  setStatus(status: VersusStatus, endMatches = false) {
    this.status = status;
    for (const conn of this.conns.values()) this.raw(conn, { t: 'status', status });
    if (status.enabled) return;
    for (const id of this.queue.clear()) this.send(id, { t: 'unqueued' });
    this.ensureTicking();
    for (const lobby of [...this.lobbies.all()]) if (!lobby.playing) this.closeLobby(lobby);
    if (endMatches) for (const match of [...this.matches]) match.cancel();
    for (const id of [...this.conns.keys()]) this.dismissIdle(id);
  }

  private closeLobby(lobby: Lobby) {
    this.dropInvites(lobby.id);
    for (const m of lobby.members) this.send(m.id, { t: 'lobbyGone', reason: 'disabled' });
    this.lobbies.close(lobby);
  }

  /** Off: a socket with no match to finish closes. */
  private dismissIdle(id: string) {
    const conn = this.conns.get(id);
    if (conn && !this.matchOf.has(id)) this.bye(conn.ws, 'disabled');
  }

  /**
   * Going down for an update: nothing new starts, and running matches get up
   * to `maxMs` to finish. Then whatever is left is cancelled and every socket
   * is told to come back (`restart`): the app reconnects to the new server.
   */
  async drain(maxMs: number) {
    this.draining = true;
    for (const id of this.queue.clear()) this.send(id, { t: 'unqueued' });
    const until = Date.now() + maxMs;
    while (this.matches.size && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
    this.close();
  }

  close() {
    for (const match of [...this.matches]) match.cancel();
    for (const conn of this.conns.values()) this.bye(conn.ws, 'restart');
    clearInterval(this.heartbeat);
    if (this.ticking) clearInterval(this.ticking);
    this.ticking = null;
  }

  counts() {
    let inMatches = 0;
    for (const m of this.matches) inMatches += m.playerIds.length;
    return { online: this.conns.size, queued: this.queue.size, lobbies: this.lobbies.size, matches: this.matches.size, inMatches };
  }
}
