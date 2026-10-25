/*
 * Versus (online multiplayer): the modes' rules and the messages between the
 * app and the server, in one place. Like contract.ts: plain types and
 * constants, no imports, because the app imports this file too.
 *
 * The server is the referee. It deals the words, judges every guess and keeps
 * the clocks; a device only ever sends letters and never holds a word it has
 * to guess (Context/versus.md).
 */

/** Bumped when a change breaks old apps: the server says `bye: 'version'` and the app asks for an update. */
export const VERSUS_PROTOCOL = 1;

export type ModeId = 'rush' | 'battle' | 'duel';
export const MODE_IDS: readonly ModeId[] = ['rush', 'battle', 'duel'];

/**
 * The modes. PLACEHOLDER numbers (durations, misses, balloons): tune them here,
 * both sides read them.
 *  - rush (Word Rush): the owner's timed challenge. Everyone gets the same words
 *    in the same order; the most words guessed when the clock runs out wins.
 *  - battle (Balloon Battle): everyone floats under 10 balloons. A miss pops one
 *    of yours; a word guessed pops one of the leader's (two if guessed without a
 *    miss). The last one still floating wins.
 *  - duel (Word Duel): one against one. Each round both pick a word for the
 *    other, then both guess at once. Best of 3.
 */
export const MODES = {
  rush: { minPlayers: 2, maxPlayers: 4, durationMs: 120_000, maxWrong: 6, toFind: 4 },
  battle: { minPlayers: 2, maxPlayers: 4, durationMs: 240_000, balloons: 10, toFind: 4, skipCost: 1, flawlessHits: 2 },
  duel: { minPlayers: 2, maxPlayers: 2, rounds: 3, winsNeeded: 2, pickMs: 20_000, guessMs: 90_000, revealMs: 4_500, cards: 3, maxWrong: 8, toFind: 5, typedMin: 4 },
} as const;

export const VERSUS_LIMITS = {
  /** 3, 2, 1, go. */
  countdownMs: 3_000,
  /** A player whose connection dropped this long during a match has left it. */
  awayForfeitMs: 45_000,
  /** A lobby member whose connection dropped this long leaves the lobby. */
  lobbyGraceMs: 20_000,
  inviteTtlMs: 60_000,
  friendsMax: 200,
  /** Friend requests waiting for an answer, per sender. */
  requestsMax: 50,
  searchMin: 2,
  searchResults: 20,
  /** Lobby codes: no 0/O or 1/I, so they read aloud. */
  codeLength: 6,
  /** Friend invite link codes (same alphabet): long enough that no one guesses one. */
  inviteCodeLength: 8,
  /** Messages a socket may send: a burst of `burst`, then `perSecond`. */
  burst: 20,
  perSecond: 10,
  messageBytes: 2_048,
} as const;

export const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The kill switch (admin page): off stops new matches, lobbies, invites and matchmaking. */
export interface VersusStatus {
  enabled: boolean;
  /** Shown under "Versus is taking a break" when off; written by the admin, in one language. */
  message: string | null;
}

export interface VersusStats {
  rating: number;
  played: number;
  won: number;
}

export type Presence = 'online' | 'playing' | 'offline';

/** Someone else, as Versus shows them. */
export interface PlayerCard {
  id: string;
  /** null: the app's default name. */
  name: string | null;
  characterId: string;
}

// ---- friends (REST: /v1/friends…, /v1/players/search) ----

export interface Friend extends PlayerCard {
  presence: Presence;
  rating: number;
}

export interface FriendsResponse {
  friends: Friend[];
  /** Asked to be my friend. */
  incoming: PlayerCard[];
  /** I asked them. */
  outgoing: PlayerCard[];
  blocked: PlayerCard[];
}

export type Relation = 'friend' | 'incoming' | 'outgoing' | 'none';

export interface SearchResponse {
  players: (PlayerCard & { relation: Relation })[];
}

/** POST /v1/friends/requests → 'friends' when they had already asked me (it's mutual). */
export interface RequestResponse {
  status: 'sent' | 'friends';
}

export type ReportReason = 'name' | 'cheating' | 'other';

// ---- friend invite links: https://<server>/i/<code> (versus/links.ts) ----

/** The path of an invite link, before its code. The app's deep links use the same path (hanged://i/<code>). */
export const INVITE_PATH = '/i/';

/** POST /v1/invites: the player's own invite code (one per player, made on the first ask). */
export interface InviteResponse {
  code: string;
}

/**
 * POST /v1/invites/:code/accept. 'friends': friends now (or already were);
 * 'sent' only when a block stands between the two, which isn't revealed.
 */
export interface InviteAcceptResponse extends RequestResponse {
  player: PlayerCard;
}

// ---- lobbies and invites ----

export interface LobbyMember extends PlayerCard {
  rating: number;
  ready: boolean;
}

export interface LobbyView {
  id: string;
  code: string;
  hostId: string;
  mode: ModeId;
  language: string;
  members: LobbyMember[];
  /** A match from this lobby is being played; the lobby comes back after it (rematch). */
  playing: boolean;
}

export interface InviteView {
  lobbyId: string;
  from: PlayerCard;
  mode: ModeId;
  /** Server clock. */
  expiresAt: number;
}

// ---- matches ----

/** One player's word, as their own device sees it: never the hidden letters. */
export interface PuzzleView {
  /** Which word of the match: 0, 1, 2… (the same for everyone at the same index). */
  index: number;
  language: string;
  /** One per letter of the word: the letter when shown, '' while hidden. */
  tiles: string[];
  /** Letters shown at the start (keys and tiles in butter). */
  clues: string[];
  hits: string[];
  misses: string[];
  /** Wrong guesses on this word, and how many it allows (battle: no limit per word, the balloons are the limit). */
  wrong: number;
  maxWrong: number;
  description: string;
  subject?: string;
  status: 'playing' | 'won' | 'lost';
}

export type Link = 'on' | 'away' | 'left';

/** What everyone sees of a player during a match: counts, never letters. */
export interface MatchPlayer extends PlayerCard {
  rating: number;
  link: Link;
  /** rush, battle: words guessed. duel: rounds won. */
  score: number;
  /** Wrong guesses over the whole match. */
  misses: number;
  /** battle: balloons left. rush, duel: misses left on the current word. */
  balloons: number;
  /** Letters found / to find on the current word: progress without giving letters away. */
  found: number;
  toFind: number;
  /** battle: landed (no balloons). duel: done with this round's word. */
  out: boolean;
}

export type MatchPhase = 'countdown' | 'pick' | 'play' | 'reveal' | 'over';

/** duel: a word card offered in the pick phase. */
export interface WordCard {
  word: string;
  description: string;
}

export interface DuelRound {
  round: number;
  /** Per player: the word they had to guess (picked by the other), and how it went. */
  results: { id: string; word: string; solved: boolean; misses: number; ms: number }[];
  /** null: a draw. */
  winnerId: string | null;
}

export interface MatchView {
  id: string;
  mode: ModeId;
  ranked: boolean;
  language: string;
  phase: MatchPhase;
  /** When the phase ends, on the server's clock. null: no deadline (over). */
  endsAt: number | null;
  /** duel: the round being played (1…3). */
  round: number;
  players: MatchPlayer[];
  /** This player's word; null when they have none (countdown, pick, landed). */
  you: PuzzleView | null;
  /** duel, pick phase: this player's cards, and whether they've picked. */
  cards?: WordCard[];
  picked?: boolean;
  /** duel: the round just finished (reveal phase and after). */
  last?: DuelRound;
}

export interface Standing extends PlayerCard {
  place: number;
  score: number;
  misses: number;
  /** Words guessed (duel: words solved). */
  words: number;
  left: boolean;
  /** Ranked matches only. */
  rating?: number;
  ratingDelta?: number;
}

export type MatchEnd = 'done' | 'forfeit' | 'cancelled';

export interface MatchResult {
  matchId: string;
  mode: ModeId;
  ranked: boolean;
  /** cancelled: the server stopped it (update, switch); nothing was counted. */
  reason: MatchEnd;
  standings: Standing[];
  /** The match's words, so everyone learns the ones they missed. */
  words: WordCard[];
}

/** A word just finished (guessed, lost or skipped): the app flashes it before the next one. */
export interface WordDone {
  index: number;
  word: string;
  won: boolean;
}

// ---- the socket: GET /v1/live ----

export type ClientMessage =
  | { t: 'auth'; id: string; secret: string; v: number }
  | { t: 'queue'; mode: ModeId; language: string }
  | { t: 'unqueue' }
  | { t: 'host'; mode: ModeId; language: string }
  | { t: 'join'; code: string }
  | { t: 'leaveLobby' }
  | { t: 'ready'; ready: boolean }
  | { t: 'mode'; mode: ModeId }
  | { t: 'start' }
  | { t: 'kick'; id: string }
  | { t: 'invite'; id: string }
  | { t: 'answer'; lobbyId: string; accept: boolean }
  /** `n`: the client's own counter, echoed back so the app knows which guess was judged. */
  | { t: 'guess'; n: number; letter: string }
  | { t: 'skip'; n: number }
  | { t: 'pick'; n: number; card?: number; word?: string }
  | { t: 'forfeit' }
  | { t: 'dismiss' };

export type ByeReason = 'elsewhere' | 'disabled' | 'restart' | 'auth' | 'version' | 'abuse';

export type LobbyGone = 'left' | 'kicked' | 'closed' | 'disabled';

export type ErrorCode =
  | 'disabled'
  | 'busy'
  | 'noLobby'
  | 'full'
  | 'notHost'
  | 'notReady'
  | 'badWord'
  | 'usedWord'
  | 'offline'
  | 'notFriend'
  | 'blocked'
  | 'noWords'
  | 'slow'
  | 'bad';

export type ServerMessage =
  /**
   * Signed in. `inMatch` / `inLobby`: what this player is still in on the
   * server; its snapshot follows at once. Anything else the app held is gone
   * (e.g. the server restarted mid-match).
   */
  | { t: 'hello'; me: string; now: number; status: VersusStatus; stats: VersusStats; inMatch: boolean; inLobby: boolean }
  | { t: 'status'; status: VersusStatus }
  | { t: 'stats'; stats: VersusStats }
  | { t: 'presence'; id: string; presence: Presence }
  /** The friends list or requests changed: fetch them again. */
  | { t: 'friends' }
  /** `by` followed this player's invite link: friends now. */
  | { t: 'friendAdded'; by: PlayerCard }
  | { t: 'invite'; invite: InviteView }
  | { t: 'inviteGone'; lobbyId: string }
  | { t: 'declined'; by: PlayerCard }
  | { t: 'queued'; mode: ModeId; since: number }
  | { t: 'unqueued' }
  | { t: 'lobby'; lobby: LobbyView }
  | { t: 'lobbyGone'; reason: LobbyGone }
  /** The whole match as this player sees it: on start, on a phase change, on reconnect. */
  | { t: 'match'; match: MatchView; now: number }
  /** One player's public counts changed. */
  | { t: 'player'; player: MatchPlayer }
  /** This player's word changed; `done` when the previous word just finished. */
  | { t: 'puzzle'; puzzle: PuzzleView | null; n?: number; done?: WordDone }
  /** battle: `from` guessed a word and popped `count` of `to`'s balloons. */
  | { t: 'hit'; from: string; to: string; count: number }
  /** duel: the picked word was refused (not in the dictionary, already used). */
  | { t: 'picked'; ok: boolean; n: number; error?: ErrorCode }
  | { t: 'end'; result: MatchResult }
  | { t: 'error'; code: ErrorCode }
  | { t: 'bye'; reason: ByeReason };
