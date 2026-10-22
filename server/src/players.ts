/*
 * Players: an anonymous id + secret made on first contact, then syncs.
 *
 * The device is the source of truth (offline first). A sync copies its
 * snapshot and adds its new round reports into the counters, all in one
 * transaction that locks the player's row, so two syncs can't interleave and
 * a report is counted once (`last_seq`).
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type { RegisterResponse, RoundReport, SyncRequest, SyncResponse } from './contract.ts';
import type { Db, Sql } from './db.ts';
import { checkName } from './names.ts';

const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');

export interface Credentials {
  id: string;
  secret: string;
}

const BEARER = /^Bearer ([0-9a-f-]{36}):([\w-]{20,100})$/i;

/** `Authorization: Bearer <id>:<secret>` → credentials, or null. */
export function credentials(header: string | undefined): Credentials | null {
  const m = header && BEARER.exec(header);
  return m ? { id: m[1].toLowerCase(), secret: m[2] } : null;
}

export async function register(db: Db): Promise<RegisterResponse> {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO players (id, secret_hash) VALUES ($1, $2)', [id, hash(secret)]);
  return { id, secret };
}

/** Reports the server hasn't taken yet, one per seq, oldest first. */
export function freshReports(reports: RoundReport[], lastSeq: number): RoundReport[] {
  const bySeq = new Map(reports.filter((r) => r.seq > lastSeq).map((r) => [r.seq, r]));
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * The score to keep. The first sync takes the device's count as it is (a
 * player who played before syncing existed). After that it can only grow by
 * the wins reported in the same sync, so a bare edited number doesn't count.
 */
export function nextScore(held: number, firstSync: boolean, reported: number, wins: number): number {
  return firstSync ? reported : Math.max(held, Math.min(reported, held + wins));
}

/** The row exists and the secret is its own. */
const owns = (row: { secret_hash: string } | undefined, who: Credentials): boolean =>
  !!row && timingSafeEqual(Buffer.from(row.secret_hash), Buffer.from(hash(who.secret)));

/** The name to keep: one the filter refuses (a modified app) is dropped, and the app shows its default. */
const allowedName = (name: string | null) => {
  const check = checkName(name);
  return check.ok ? check.name : null;
};

interface PlayerRow {
  secret_hash: string;
  last_seq: number;
  words_guessed: number;
  synced_at: Date | null;
}

/** null: unknown player or wrong secret. */
export function sync(db: Db, who: Credentials, { player, reports }: SyncRequest): Promise<SyncResponse | null> {
  return db.tx(async (sql) => {
    const { rows } = await sql.query<PlayerRow>(
      'SELECT secret_hash, last_seq, words_guessed, synced_at FROM players WHERE id = $1 FOR UPDATE',
      [who.id],
    );
    const held = rows[0];
    if (!owns(held, who)) return null;

    const fresh = freshReports(reports, held.last_seq);
    const wins = fresh.filter((r) => r.won).length;
    const words = nextScore(held.words_guessed, held.synced_at === null, player.wordsGuessed, wins);
    const acked = fresh.length ? fresh[fresh.length - 1].seq : held.last_seq;
    await sql.query(
      `UPDATE players SET
         name = $2, character_id = $3, language = $4, level = $5, tokens = $6,
         score_at = CASE WHEN $7 > words_guessed THEN now() ELSE score_at END,
         words_guessed = $7,
         rounds_played = rounds_played + $8, rounds_won = rounds_won + $9,
         last_seq = $10, synced_at = now()
       WHERE id = $1`,
      [who.id, allowedName(player.name), player.characterId, player.language, player.level, player.tokens, words, fresh.length, wins, acked],
    );
    if (fresh.length) await addRounds(sql, who.id, fresh);
    return { acked, wordsGuessed: words };
  });
}

/**
 * Deletes the player (App Store Guideline 5.1.1(v)): their row, and with it
 * their weekly counts (ON DELETE CASCADE). The word statistics stay: they are
 * counts per word and day, with nothing that points back to a player.
 * false: unknown player or wrong secret.
 */
export function deletePlayer(db: Db, who: Credentials): Promise<boolean> {
  return db.tx(async (sql) => {
    const { rows } = await sql.query<{ secret_hash: string }>('SELECT secret_hash FROM players WHERE id = $1 FOR UPDATE', [who.id]);
    if (!owns(rows[0], who)) return false;
    await sql.query('DELETE FROM players WHERE id = $1', [who.id]);
    return true;
  });
}

/** Week (Monday, UTC) and day (UTC) of an epoch-ms column. */
const WEEK = `date_trunc('week', to_timestamp(at / 1000.0) AT TIME ZONE 'UTC')::date`;
const DAY = `(to_timestamp(at / 1000.0) AT TIME ZONE 'UTC')::date`;

async function addRounds(sql: Sql, playerId: string, reports: RoundReport[]) {
  // A device clock ahead of ours must not file wins in a week that hasn't started.
  const now = Date.now();
  const at = (r: RoundReport) => Math.min(r.at, now);
  const won = reports.filter((r) => r.won);
  if (won.length)
    await sql.query(
      `INSERT INTO player_weeks (player_id, week, words)
       SELECT $1, ${WEEK} AS week, count(*)::int FROM unnest($2::float8[]) AS t(at) GROUP BY week ORDER BY week
       ON CONFLICT (player_id, week) DO UPDATE SET words = player_weeks.words + excluded.words, score_at = now()`,
      [playerId, won.map(at)],
    );
  // Rows are locked in key order, so two players' syncs can't deadlock on the same words.
  await sql.query(
    `INSERT INTO word_days (word_id, day, played, won, wrong, descriptions, letters)
     SELECT word_id, ${DAY} AS day, count(*), count(*) FILTER (WHERE won), sum(wrong),
            count(*) FILTER (WHERE description), count(*) FILTER (WHERE letters)
     FROM unnest($1::text[], $2::float8[], $3::bool[], $4::int[], $5::bool[], $6::bool[])
          AS r(word_id, at, won, wrong, description, letters)
     GROUP BY word_id, day ORDER BY word_id, day
     ON CONFLICT (word_id, day) DO UPDATE SET
       played = word_days.played + excluded.played,
       won = word_days.won + excluded.won,
       wrong = word_days.wrong + excluded.wrong,
       descriptions = word_days.descriptions + excluded.descriptions,
       letters = word_days.letters + excluded.letters`,
    [
      reports.map((r) => r.wordId),
      reports.map(at),
      reports.map((r) => r.won),
      reports.map((r) => r.wrong),
      reports.map((r) => r.description),
      reports.map((r) => r.letters),
    ],
  );
}
