/*
 * Players: an anonymous id + secret made on first contact, then syncs.
 *
 * The device is the source of truth (offline first). A sync copies its
 * snapshot and adds its new round reports into the counters, all in one
 * transaction that locks the player's row, so two syncs can't interleave and
 * a report is counted once (`last_seq`).
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { LIMITS, type RegisterResponse, type RoundReport, type SyncRequest, type SyncResponse } from './contract.ts';
import type { Db, Sql } from './db.ts';
import { checkName, isReservedName, nameKey, type NameRules, nameVariants } from './names.ts';
import { isRole, type Role, roleCan } from './roles.ts';

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
 * The score to keep: it only grows by the wins reported in the same sync, so a
 * bare edited number doesn't count, not even on the first sync (a new account
 * claiming millions). Every win since install is in the device's reports.
 */
export function nextScore(held: number, reported: number, wins: number): number {
  return Math.max(held, Math.min(reported, held + wins));
}

/** One reported win refills the budget this often: no person wins a round every 5 s for hours. */
export const WIN_REFILL_MS = 5_000;

/**
 * Anti-cheat: reported wins spend a budget that refills one win every
 * WIN_REFILL_MS, up to LIMITS.reportsKept (all a device can hold unsynced), so
 * a new account, or one back from weeks offline, always has room for every
 * real round. GCRA: `tat` (players.wins_tat) is when the budget is empty; null
 * = full. `allowed` wins fit now; `spend(n)` is the tat to keep after n.
 */
export function winBudget(tat: number | null, now: number, refillMs = WIN_REFILL_MS, cap: number = LIMITS.reportsKept) {
  const start = Math.max(tat ?? -Infinity, now - cap * refillMs);
  return { allowed: Math.max(0, Math.floor((now - start) / refillMs)), spend: (n: number) => start + n * refillMs };
}

/** The reports to count: every loss, and wins until `allowed`. The wins past it are faster than anyone plays. */
export function withinBudget(reports: RoundReport[], allowed: number): RoundReport[] {
  let wins = 0;
  return reports.filter((r) => !r.won || wins++ < allowed);
}

/** The row exists and the secret is its own. */
export const owns = (row: { secret_hash: string } | undefined, who: Credentials): boolean =>
  !!row && timingSafeEqual(Buffer.from(row.secret_hash), Buffer.from(hash(who.secret)));

/** The credentials are a player's own (a REST call's sign-in: one indexed read). */
async function authorized(db: Sql, who: Credentials): Promise<boolean> {
  const { rows } = await db.query<{ secret_hash: string }>('SELECT secret_hash FROM players WHERE id = $1', [who.id]);
  return owns(rows[0], who);
}

/** The signed-in player's id, or null: no `Authorization`, or not a player's own credentials. */
export async function signedIn(db: Sql, header: string | undefined): Promise<string | null> {
  const who = credentials(header);
  return who && (await authorized(db, who)) ? who.id : null;
}

/** The name to keep: one the filter refuses (a modified app) is dropped, and the app shows its default. */
const allowedName = (name: string | null, rules: NameRules) => {
  const check = checkName(name, rules);
  return check.ok ? check.name : null;
};

/** What a role allows in a name: only the server's role, never the device's word for it. */
const nameRules = (role: Role | null): NameRules => ({ reserved: roleCan(role, 'reservedNames') });

/** The player's staff role, or null (a regular player, or unknown). */
export async function roleOf(db: Sql, id: string): Promise<Role | null> {
  const { rows } = await db.query<{ role: string | null }>('SELECT role FROM players WHERE id = $1', [id]);
  const role = rows[0]?.role;
  return isRole(role) ? role : null;
}

/** Tried in turn when the name is taken: "Roda2"…"Roda99", then up to four digits. */
const VARIANT_RANGES = [[2, 99], [100, 9_999]] as const;

/**
 * Names are unique (nameKey: case, accents, spaces and punctuation aside). A
 * name someone else holds falls back to the first free variant ("Roda2"),
 * which the app adopts from the response; null if every one is taken. The
 * unique index has the last word: a player taking the same name at the same
 * moment fails this sync, and the retry picks the next variant.
 */
async function freeName(sql: Sql, playerId: string, wanted: string, rules: NameRules): Promise<string | null> {
  let candidates = [wanted];
  for (const [from, to] of VARIANT_RANGES) {
    candidates = [...candidates, ...nameVariants(wanted, from, to)].filter((n) => checkName(n, rules).ok);
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

/**
 * No one else holds the name (the player's own counts as free), and it passes
 * checkName. A reserved name passes only for a `signedIn` player (credentials
 * checked) holding the role for it: player ids are public on the boards, so a
 * bare `me` would tell anyone which accounts are staff.
 */
export async function nameAvailable(db: Db, raw: string, me?: string, signedIn?: string): Promise<boolean> {
  me = signedIn ?? me;
  const check = checkName(raw, signedIn && isReservedName(raw) ? nameRules(await roleOf(db, signedIn)) : {});
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
  wins_tat: number | null;
  role: string | null;
}

/** null: unknown player or wrong secret. */
export function sync(db: Db, who: Credentials, { player, reports }: SyncRequest): Promise<SyncResponse | null> {
  return db.tx(async (sql) => {
    const { rows } = await sql.query<PlayerRow>(
      'SELECT secret_hash, last_seq, words_guessed, name_key, wins_tat, role FROM players WHERE id = $1 FOR UPDATE',
      [who.id],
    );
    const held = rows[0];
    if (!owns(held, who)) return null;
    const role = isRole(held.role) ? held.role : null;

    const fresh = freshReports(reports, held.last_seq);
    const acked = fresh.length ? fresh[fresh.length - 1].seq : held.last_seq;
    // An unranked account (a developer's) has its rounds acked but never counted: no score, no
    // weekly row, no word statistics. Its rounds were played with powers nobody else has.
    const unranked = roleCan(role, 'unranked');
    // Wins faster than the budget allows are acked and dropped (a modified app), like an unranked account's
    const budget = winBudget(held.wins_tat, Date.now());
    const counted = unranked ? [] : withinBudget(fresh, budget.allowed);
    const wins = counted.filter((r) => r.won).length;
    const words = unranked ? held.words_guessed : nextScore(held.words_guessed, player.wordsGuessed, wins);
    const rules = nameRules(role);
    const wanted = allowedName(player.name, rules);
    // Every sync sends the name: only look it up when it isn't already the player's own.
    const name = wanted && (nameKey(wanted) === held.name_key ? wanted : await freeName(sql, who.id, wanted, rules));
    await sql.query(
      `UPDATE players SET
         name = $2, name_key = $3, character_id = $4, language = $5, level = $6, tokens = $7,
         score_at = CASE WHEN $8 > words_guessed THEN now() ELSE score_at END,
         words_guessed = $8,
         rounds_played = rounds_played + $9, rounds_won = rounds_won + $10,
         tokens_earned = tokens_earned + $11, misses = misses + $12,
         last_seq = $13, synced_at = now(), wins_tat = $14
       WHERE id = $1`,
      [
        who.id, name, name && nameKey(name), player.characterId, player.language, player.level, player.tokens, words,
        counted.length, wins, sum(counted, earned), sum(counted, (r) => r.wrong), acked, wins ? budget.spend(wins) : held.wins_tat,
      ],
    );
    if (counted.length) await addRounds(sql, who.id, counted);
    return { acked, wordsGuessed: words, name, role };
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
