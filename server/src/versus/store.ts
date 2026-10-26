/*
 * What Versus keeps in the database: friends, friend requests, invite
 * codes, blocks, reports, each player's rating and match counts, matches per day, and the
 * on/off switch. A match itself is never written while it's played: its
 * outcome is one transaction when it ends (saveResult).
 */
import { randomBytes } from 'node:crypto';

import type { Db, Sql } from '../db.ts';
import { nameKey } from '../names.ts';
import { type Credentials, owns } from '../players.ts';
import { isRole, type Role } from '../roles.ts';
import {
  type FriendsResponse,
  LOBBY_CODE_ALPHABET,
  type MatchResult,
  type PlayerCard,
  type Presence,
  type Relation,
  type ReportReason,
  type SearchResponse,
  VERSUS_LIMITS,
  type VersusStats,
  type VersusStatus,
} from '../versus-contract.ts';

export interface VersusPlayer extends PlayerCard, VersusStats {
  /** Staff role (roles.ts): an unranked one makes a matchmade match unrated for everyone in it. */
  role: Role | null;
}

/** The player behind the credentials, or null (unknown, wrong secret). */
export async function versusPlayer(db: Sql, who: Credentials): Promise<VersusPlayer | null> {
  const { rows } = await db.query<Omit<VersusPlayer, 'role'> & { secret_hash: string; role: string | null }>(
    `SELECT secret_hash, id, name, character_id AS "characterId",
            versus_rating AS rating, versus_played AS played, versus_won AS won, role
     FROM players WHERE id = $1`,
    [who.id],
  );
  if (!owns(rows[0], who)) return null;
  const { secret_hash: _, role, ...player } = rows[0];
  return { ...player, role: isRole(role) ? role : null };
}

export async function stats(db: Sql, id: string): Promise<VersusStats> {
  const { rows } = await db.query<VersusStats>(
    'SELECT versus_rating AS rating, versus_played AS played, versus_won AS won FROM players WHERE id = $1',
    [id],
  );
  return rows[0] ?? { rating: 1000, played: 0, won: 0 };
}

export async function friendIds(db: Sql, id: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>('SELECT friend_id AS id FROM friends WHERE player_id = $1', [id]);
  return rows.map((r) => r.id);
}

/** Players blocked by `id` or who blocked `id`: a block works both ways. */
export async function blockIds(db: Sql, id: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT blocked_id AS id FROM blocks WHERE player_id = $1 UNION SELECT player_id FROM blocks WHERE blocked_id = $1',
    [id],
  );
  return rows.map((r) => r.id);
}

const CARD = `p.id, p.name, p.character_id AS "characterId", p.versus_rating AS rating`;

/** All four lists in one round trip. */
export async function friendsOf(db: Sql, id: string, presence: (id: string) => Presence): Promise<FriendsResponse> {
  const { rows } = await db.query<PlayerCard & { kind: 'f' | 'i' | 'o' | 'b'; rating: number }>(
    `SELECT 'f' AS kind, ${CARD} FROM friends x JOIN players p ON p.id = x.friend_id WHERE x.player_id = $1
     UNION ALL SELECT 'i', ${CARD} FROM friend_requests x JOIN players p ON p.id = x.from_id WHERE x.to_id = $1
     UNION ALL SELECT 'o', ${CARD} FROM friend_requests x JOIN players p ON p.id = x.to_id WHERE x.from_id = $1
     UNION ALL SELECT 'b', ${CARD} FROM blocks x JOIN players p ON p.id = x.blocked_id WHERE x.player_id = $1`,
    [id],
  );
  const card = ({ id, name, characterId }: PlayerCard): PlayerCard => ({ id, name, characterId });
  const byName = (a: PlayerCard, b: PlayerCard) => (a.name ?? '').localeCompare(b.name ?? '');
  const of = (kind: string) => rows.filter((r) => r.kind === kind);
  const order: Record<Presence, number> = { playing: 0, online: 0, offline: 1 };
  return {
    friends: of('f')
      .map((r) => ({ ...card(r), rating: r.rating, presence: presence(r.id) }))
      .sort((a, b) => order[a.presence] - order[b.presence] || byName(a, b)),
    incoming: of('i').map(card).sort(byName),
    outgoing: of('o').map(card).sort(byName),
    blocked: of('b').map(card).sort(byName),
  };
}

export const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** Players whose name starts with `q` (case, accents and punctuation aside), not blocked either way. */
export async function search(db: Sql, me: string, q: string): Promise<SearchResponse> {
  const key = nameKey(q);
  if (key.length < VERSUS_LIMITS.searchMin) return { players: [] };
  const { rows } = await db.query<PlayerCard & { relation: Relation }>(
    `SELECT p.id, p.name, p.character_id AS "characterId",
       CASE WHEN EXISTS (SELECT 1 FROM friends f WHERE f.player_id = $1 AND f.friend_id = p.id) THEN 'friend'
            WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.from_id = p.id AND r.to_id = $1) THEN 'incoming'
            WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.from_id = $1 AND r.to_id = p.id) THEN 'outgoing'
            ELSE 'none' END AS relation
     FROM players p
     WHERE p.name_key LIKE $2 || '%' AND p.id <> $1
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.player_id = $1 AND b.blocked_id = p.id) OR (b.player_id = p.id AND b.blocked_id = $1))
     ORDER BY p.name_key = $3 DESC, p.name_key
     LIMIT $4`,
    [me, likeEscape(key), key, VERSUS_LIMITS.searchResults],
  );
  return { players: rows };
}

const blockedEitherWay = async (sql: Sql, a: string, b: string) =>
  (
    await sql.query(
      'SELECT 1 FROM blocks WHERE (player_id = $1 AND blocked_id = $2) OR (player_id = $2 AND blocked_id = $1)',
      [a, b],
    )
  ).rows.length > 0;

const count = async (sql: Sql, text: string, id: string) => (await sql.query<{ n: number }>(text, [id])).rows[0].n;
const friendCount = (sql: Sql, id: string) => count(sql, 'SELECT count(*)::int AS n FROM friends WHERE player_id = $1', id);
/** Either friends list is at its cap. */
const full = async (sql: Sql, a: string, b: string) =>
  (await friendCount(sql, a)) >= VERSUS_LIMITS.friendsMax || (await friendCount(sql, b)) >= VERSUS_LIMITS.friendsMax;
const areFriends = async (sql: Sql, a: string, b: string) =>
  (await sql.query('SELECT 1 FROM friends WHERE player_id = $1 AND friend_id = $2', [a, b])).rows.length > 0;

/** Locks both players' rows, in id order so two players acting on each other at once can't deadlock. Their cards, the ones that exist. */
async function lockPair(sql: Sql, a: string, b: string): Promise<PlayerCard[]> {
  const { rows } = await sql.query<PlayerCard>(
    `SELECT id, name, character_id AS "characterId" FROM players WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
    [[a, b]],
  );
  return rows;
}

async function befriend(sql: Sql, a: string, b: string) {
  await sql.query(
    `INSERT INTO friends (player_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
    [a, b],
  );
  await sql.query('DELETE FROM friend_requests WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)', [a, b]);
}

export type RequestOutcome = 'sent' | 'friends' | 'notFound' | 'limit';

/**
 * Asks `to` to be friends. If they had already asked, it's mutual: friends now.
 * A block (either way) answers 'sent' and does nothing, so a block isn't revealed.
 */
export function sendRequest(db: Db, from: string, to: string): Promise<RequestOutcome> {
  return db.tx(async (sql) => {
    if ((await lockPair(sql, from, to)).length < 2) return 'notFound';
    if (await blockedEitherWay(sql, from, to)) return 'sent';
    if (await areFriends(sql, from, to)) return 'friends';
    const theyAsked = await sql.query('SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2', [to, from]);
    if (theyAsked.rows.length) {
      if (await full(sql, from, to)) return 'limit';
      await befriend(sql, from, to);
      return 'friends';
    }
    if (await count(sql, 'SELECT count(*)::int AS n FROM friend_requests WHERE from_id = $1', from) >= VERSUS_LIMITS.requestsMax) return 'limit';
    if (await friendCount(sql, from) >= VERSUS_LIMITS.friendsMax) return 'limit';
    await sql.query('INSERT INTO friend_requests (from_id, to_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [from, to]);
    return 'sent';
  });
}

/** `from` asked `me`: now they're friends. false: no such request, or a friends list is full. */
export function acceptRequest(db: Db, me: string, from: string): Promise<boolean> {
  return db.tx(async (sql) => {
    await lockPair(sql, me, from);
    const asked = await sql.query('SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2', [from, me]);
    if (!asked.rows.length || (await full(sql, me, from))) return false;
    await befriend(sql, me, from);
    return true;
  });
}

/** Declines a request they sent, or cancels one I sent. */
export async function deleteRequest(db: Sql, me: string, other: string): Promise<boolean> {
  const { rows } = await db.query(
    'DELETE FROM friend_requests WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1) RETURNING 1',
    [me, other],
  );
  return rows.length > 0;
}

export async function removeFriend(db: Sql, me: string, other: string): Promise<boolean> {
  const { rows } = await db.query(
    'DELETE FROM friends WHERE (player_id = $1 AND friend_id = $2) OR (player_id = $2 AND friend_id = $1) RETURNING 1',
    [me, other],
  );
  return rows.length > 0;
}

/** Blocks `other`: no longer friends, requests gone, and never matched, invited or found again. */
export function block(db: Db, me: string, other: string): Promise<boolean> {
  return db.tx(async (sql) => {
    const { rows } = await sql.query('INSERT INTO blocks (player_id, blocked_id) SELECT $1, id FROM players WHERE id = $2 ON CONFLICT DO NOTHING RETURNING 1', [me, other]);
    await removeFriend(sql, me, other);
    await deleteRequest(sql, me, other);
    return rows.length > 0;
  });
}

export async function unblock(db: Sql, me: string, other: string): Promise<boolean> {
  const { rows } = await db.query('DELETE FROM blocks WHERE player_id = $1 AND blocked_id = $2 RETURNING 1', [me, other]);
  return rows.length > 0;
}

// ---- friend invite links (versus/links.ts) ----

/** A new invite code: 8 of the lobby codes' 32 letters (40 bits), from the crypto source. */
export const newInviteCode = (bytes = randomBytes(VERSUS_LIMITS.inviteCodeLength)) =>
  Array.from(bytes, (b) => LOBBY_CODE_ALPHABET[b % LOBBY_CODE_ALPHABET.length]).join('');

/** The player's invite code, made on the first ask and then kept, so every link they ever shared still works. */
export async function inviteCode(db: Sql, id: string): Promise<string | null> {
  // Two players drawing the same code (1 in 10^12) fails the unique index: draw again
  for (let tries = 1; ; tries++) {
    try {
      const { rows } = await db.query<{ code: string }>(
        'UPDATE players SET invite_code = coalesce(invite_code, $2) WHERE id = $1 RETURNING invite_code AS code',
        [id, newInviteCode()],
      );
      return rows[0]?.code ?? null;
    } catch (e) {
      if (tries >= 3) throw e;
    }
  }
}

/** Whose invite code it is; null when no one's. */
export async function inviter(db: Sql, code: string): Promise<PlayerCard | null> {
  const { rows } = await db.query<PlayerCard>('SELECT id, name, character_id AS "characterId" FROM players WHERE invite_code = $1', [code]);
  return rows[0] ?? null;
}

export type InviteOutcome =
  | { status: 'sent' | 'friends'; host: PlayerCard; guest: PlayerCard; added: boolean }
  | 'notFound'
  | 'self'
  | 'limit';

/**
 * `me` followed the invite link of `code`: friends at once, no request to
 * answer (sharing the link was the invitation). Already friends: nothing to do.
 * A block (either way) answers 'sent' and does nothing, as a request would.
 */
export function acceptInvite(db: Db, me: string, code: string): Promise<InviteOutcome> {
  return db.tx(async (sql) => {
    const found = await inviter(sql, code);
    if (!found) return 'notFound';
    if (found.id === me) return 'self';
    const cards = await lockPair(sql, me, found.id);
    const host = cards.find((c) => c.id === found.id);
    const guest = cards.find((c) => c.id === me);
    if (!host || !guest) return 'notFound';
    if (await blockedEitherWay(sql, me, host.id)) return { status: 'sent', host, guest, added: false };
    if (await areFriends(sql, me, host.id)) return { status: 'friends', host, guest, added: false };
    if (await full(sql, me, host.id)) return 'limit';
    await befriend(sql, me, host.id);
    return { status: 'friends', host, guest, added: true };
  });
}

/** One report per pair: reporting again replaces the reason. */
export async function report(db: Sql, me: string, other: string, reason: ReportReason): Promise<boolean> {
  const { rows } = await db.query(
    `INSERT INTO player_reports (reporter_id, reported_id, reason) SELECT $1, id, $3 FROM players WHERE id = $2
     ON CONFLICT (reporter_id, reported_id) DO UPDATE SET reason = excluded.reason, created_at = now() RETURNING 1`,
    [me, other, reason],
  );
  return rows.length > 0;
}

/**
 * A finished match, counted: every player played one, the winners (place 1)
 * won one, ranked matches move ratings. One transaction, players in id order.
 * A cancelled match counts nothing. Bots (`botIds`) have no row: only the
 * day's count of matches with bots notes them.
 */
export async function saveResult(db: Db, result: MatchResult, botIds: readonly string[] = []): Promise<void> {
  if (result.reason === 'cancelled') return;
  const rows = result.standings.filter((s) => !botIds.includes(s.id)).sort((a, b) => a.id.localeCompare(b.id));
  await db.tx(async (sql) => {
    await sql.query(
      `UPDATE players p SET
         versus_played = versus_played + 1,
         versus_won = versus_won + r.won,
         versus_rating = greatest(100, versus_rating + r.delta)
       FROM unnest($1::uuid[], $2::int[], $3::int[]) AS r(id, won, delta)
       WHERE p.id = r.id`,
      [rows.map((s) => s.id), rows.map((s) => (s.place === 1 && !s.left ? 1 : 0)), rows.map((s) => s.ratingDelta ?? 0)],
    );
    await sql.query(
      `INSERT INTO versus_days (day, mode, matches, players, forfeits, bot_matches)
       VALUES ((now() AT TIME ZONE 'UTC')::date, $1, 1, $2, $3, $4)
       ON CONFLICT (day, mode) DO UPDATE SET
         matches = versus_days.matches + 1,
         players = versus_days.players + excluded.players,
         forfeits = versus_days.forfeits + excluded.forfeits,
         bot_matches = versus_days.bot_matches + excluded.bot_matches`,
      [result.mode, rows.length, result.reason === 'forfeit' ? 1 : 0, botIds.length ? 1 : 0],
    );
  });
}

const SWITCH_KEY = 'versus';
export const VERSUS_ON: VersusStatus = { enabled: true, message: null };

export async function readSwitch(db: Sql): Promise<VersusStatus> {
  const { rows } = await db.query<{ value: VersusStatus }>('SELECT value FROM settings WHERE key = $1', [SWITCH_KEY]);
  return rows[0] ? { ...VERSUS_ON, ...rows[0].value } : VERSUS_ON;
}

export async function writeSwitch(db: Sql, status: VersusStatus): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [SWITCH_KEY, JSON.stringify(status)],
  );
}

/** For the admin page: the last 7 days of matches, and the most reported players. */
export async function adminTotals(db: Sql) {
  const days = await db.query<{ day: string; mode: string; matches: number; players: number; forfeits: number; botMatches: number }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, mode, matches, players, forfeits, bot_matches AS "botMatches" FROM versus_days
     WHERE day > (now() AT TIME ZONE 'UTC')::date - 7 ORDER BY day DESC, mode`,
  );
  const reported = await db.query<{ id: string; name: string | null; reports: number }>(
    `SELECT p.id, p.name, count(*)::int AS reports FROM player_reports r JOIN players p ON p.id = r.reported_id
     GROUP BY p.id, p.name ORDER BY reports DESC LIMIT 20`,
  );
  return { days: days.rows, reported: reported.rows };
}
