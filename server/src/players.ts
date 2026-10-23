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
import { checkName, nameKey, nameVariants } from './names.ts';

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
export const owns = (row: { secret_hash: string } | undefined, who: Credentials): boolean =>
  !!row && timingSafeEqual(Buffer.from(row.secret_hash), Buffer.from(hash(who.secret)));

/** The name to keep: one the filter refuses (a modified app) is dropped, and the app shows its default. */
const allowedName = (name: string | null) => {
  const check = checkName(name);
  return check.ok ? check.name : null;
};

/** Tried in turn when the name is taken: "Roda2"…"Roda99", then up to four digits. */
const VARIANT_RANGES = [[2, 99], [100, 9_999]] as const;

/**
 * Names are unique (nameKey: case, accents, spaces and punctuation aside). A
 * name someone else holds falls back to the first free variant ("Roda2"),
 * which the app adopts from the response; null if every one is taken. The
 * unique index has the last word: a player taking the same name at the same
 * moment fails this sync, and the retry picks the next variant.
 */
async function freeName(sql: Sql, playerId: string, wanted: string): Promise<string | null> {
  let candidates = [wanted];
  for (const [from, to] of VARIANT_RANGES) {
    candidates = [...candidates, ...nameVariants(wanted, from, to)].filter((n) => checkName(n).ok);
    const { rows } = await sql.query<{ name_key: string }>(
      'SELECT name_key FROM players WHERE name_key = ANY($1) AND id <> $2',
      [candidates.map(nameKey), playerId],
    );
    const taken = new Set(rows.map((r) => r.name_key));
    const free = candidates.find((n) => !taken.has(nameKey(n)));
    if (free) return free;
    candidates = [];
  }
  return null;
}

/** No one else holds the name (the player's own counts as free), and it passes checkName. */
export async function nameAvailable(db: Db, raw: string, me?: string): Promise<boolean> {
  const check = checkName(raw);
  if (!check.ok) return false;
  const { rows } = await db.query('SELECT 1 FROM players WHERE name_key = $1 AND id IS DISTINCT FROM $2::uuid', [
    nameKey(check.name),
    me ?? null,
  ]);
  return rows.length === 0;
}

interface PlayerRow {
  secret_hash: string;
  last_seq: number;
  words_guessed: number;
  name_key: string | null;
  synced_at: Date | null;
}

/** null: unknown player or wrong secret. */
export function sync(db: Db, who: Credentials, { player, reports }: SyncRequest): Promise<SyncResponse | null> {
  return db.tx(async (sql) => {
    const { rows } = await sql.query<PlayerRow>(
      'SELECT secret_hash, last_seq, words_guessed, name_key, synced_at FROM players WHERE id = $1 FOR UPDATE',
      [who.id],
    );
    const held = rows[0];
    if (!owns(held, who)) return null;

    const fresh = freshReports(reports, held.last_seq);
    const wins = fresh.filter((r) => r.won).length;
    const words = nextScore(held.words_guessed, held.synced_at === null, player.wordsGuessed, wins);
    const acked = fresh.length ? fresh[fresh.length - 1].seq : held.last_seq;
    const wanted = allowedName(player.name);
    // Every sync sends the name: only look it up when it isn't already the player's own.
    const name = wanted && (nameKey(wanted) === held.name_key ? wanted : await freeName(sql, who.id, wanted));
    await sql.query(
      `UPDATE players SET
         name = $2, name_key = $3, character_id = $4, language = $5, level = $6, tokens = $7,
         score_at = CASE WHEN $8 > words_guessed THEN now() ELSE score_at END,
         words_guessed = $8,
         rounds_played = rounds_played + $9, rounds_won = rounds_won + $10,
         tokens_earned = tokens_earned + $11, misses = misses + $12,
         last_seq = $13, synced_at = now()
       WHERE id = $1`,
      [
        who.id, name, name && nameKey(name), player.characterId, player.language, player.level, player.tokens, words,
        fresh.length, wins, sum(fresh, earned), sum(fresh, (r) => r.wrong), acked,
      ],
    );
    if (fresh.length) await addRounds(sql, who.id, fresh);
    return { acked, wordsGuessed: words, name };
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

const earned = (r: RoundReport) => r.tokens ?? 0;
const sum = (reports: RoundReport[], of: (r: RoundReport) => number) => reports.reduce((n, r) => n + of(r), 0);

/** Week (Monday, UTC) and day (UTC) of an epoch-ms column. */
const WEEK = `date_trunc('week', to_timestamp(at / 1000.0) AT TIME ZONE 'UTC')::date`;
const DAY = `(to_timestamp(at / 1000.0) AT TIME ZONE 'UTC')::date`;

async function addRounds(sql: Sql, playerId: string, reports: RoundReport[]) {
  // A device clock ahead of ours must not file wins in a week that hasn't started.
  const now = Date.now();
  const at = (r: RoundReport) => Math.min(r.at, now);
  // Lost rounds count too (misses); the week's board skips rows without a word.
  await sql.query(
    `INSERT INTO player_weeks (player_id, week, words, level, tokens_earned, misses)
     SELECT $1, ${WEEK} AS week, count(*) FILTER (WHERE won), max(level), sum(tokens), sum(wrong)
     FROM unnest($2::float8[], $3::bool[], $4::int[], $5::int[], $6::int[]) AS r(at, won, level, tokens, wrong)
     GROUP BY week ORDER BY week
     ON CONFLICT (player_id, week) DO UPDATE SET
       words = player_weeks.words + excluded.words,
       level = greatest(player_weeks.level, excluded.level),
       tokens_earned = player_weeks.tokens_earned + excluded.tokens_earned,
       misses = player_weeks.misses + excluded.misses,
       score_at = CASE WHEN excluded.words > 0 THEN now() ELSE player_weeks.score_at END`,
    [playerId, reports.map(at), reports.map((r) => r.won), reports.map((r) => r.level), reports.map(earned), reports.map((r) => r.wrong)],
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
