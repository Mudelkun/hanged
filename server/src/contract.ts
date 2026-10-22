/*
 * The API between the app and the server, in one place. Plain types and
 * constants, no imports: the app imports this file too (src/net/), so keep
 * it free of server code. The routes' JSON schemas (app.ts) enforce it.
 */

export type Period = 'week' | 'all';

/**
 * A finished solo round, as the device reports it. The server keeps no rounds:
 * it adds them to the word statistics, the player's weekly count and totals.
 */
export interface RoundReport {
  /** 1, 2, 3… per device. The server skips any seq it already took, so a retry never counts twice. */
  seq: number;
  wordId: string;
  /** The round's level. */
  level: number;
  won: boolean;
  /** Wrong guesses when the round ended. */
  wrong: number;
  /** Description shown during play; always true on current clients, optional reveal on older ones. */
  description: boolean;
  /** The player bought letters. */
  letters: boolean;
  /** When the round ended: epoch ms on the device's clock (the server caps it at its own now). */
  at: number;
}

/** What the device holds about the player. The device is the source of truth; the server copies it. */
export interface PlayerSnapshot {
  /** Checked by names.ts on both sides; null = the app's default name. */
  name: string | null;
  characterId: string;
  language: string;
  wordsGuessed: number;
  level: number;
  tokens: number;
}

export interface RegisterResponse {
  id: string;
  /** Proves the device owns `id`. Sent as `Authorization: Bearer <id>:<secret>`. */
  secret: string;
}

export interface SyncRequest {
  player: PlayerSnapshot;
  /** Oldest first, at most LIMITS.reportsPerSync. */
  reports: RoundReport[];
}

export interface SyncResponse {
  /** Every report with seq ≤ acked is counted: the device can drop them. */
  acked: number;
  /** The score the server holds (it may cap a jump the reports don't explain). */
  wordsGuessed: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string | null;
  characterId: string;
  words: number;
}

export interface LeaderboardResponse {
  period: Period;
  entries: LeaderboardEntry[];
  /** The asking player's place, or null before their first word guessed in the period. */
  me: { rank: number; words: number } | null;
}

export const LIMITS = {
  reportsPerSync: 200,
  boardSize: 50,
} as const;
