/*
 * The crowd (owner's request, 2026-10-26): about 100 simulated players who
 * keep the leaderboards alive while real players are few.
 *
 * They are ordinary `players` rows marked `bot` (migration 009), so the boards,
 * their index and every player's rank need nothing new: a bot ranks, ties and
 * fills a week exactly like a person, and the app gets nothing that says "bot".
 * They can't sign in (their secret hash matches no secret), so they never touch
 * the word statistics or Versus. Players can find them and ask them to be
 * friends (owner's call, 2026-10-26: it feels alive); they never answer, so the
 * request waits like one to a player who doesn't open the app.
 *
 * How they play: each has a persona drawn from its id (time zone, words won on
 * a day it plays, how many days it plays, win rate, the highest level it
 * holds), and plays hour by hour on a day's curve (evenings most, nights
 * hardly). Whether it plays on a given day is drawn from its id and the day,
 * so it holds all day. A timer moves every bot from its `synced_at` to now: the
 * same step builds a new bot's past (it "joined" weeks ago) and catches up
 * after a restart, and moving to a moment already reached adds nothing.
 */
import { randomUUID } from 'node:crypto';

import type { Db, Sql } from './db.ts';
import { nameKey } from './names.ts';
import { WEEK } from './players.ts';
import { DEFAULT_MAX_WRONG } from './rules.ts';
import { botCharacter, botName, gauss } from './versus/bots.ts';

/** PLACEHOLDER tuning. Pairs are [low, high]. */
export const CROWD = {
  /** LEADERBOARD_BOTS's default: bots kept on the boards. */
  size: 100,
  tickMs: 5 * 60_000,
  /** A new bot joined this many days ago, recent ones more often (a growing game). */
  joinedDays: [2, 60],
  /** Words won on a day it plays: log-normal around the median, clamped. */
  perDay: { median: 9, spread: 0.85, min: 1.5, max: 60 },
  /** Chance it plays on a given day. */
  days: [0.3, 0.95],
  winRate: [0.65, 0.9],
  /** Wrong guesses in a won round. A lost one is DEFAULT_MAX_WRONG. */
  missesPerWin: [2, 5],
  /** Weekends bring more play. */
  weekend: 1.3,
  /** src/game/config.ts WORDS_PER_LEVEL, and the levels a bot tops out at (its skill). */
  wordsPerLevel: 10,
  ceiling: [6, 20],
  /** After a long stop the crowd catches up this much at most. */
  catchUpDays: 90,
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Share of a day's play in each local hour: a little at breakfast and lunch, most in the evening. */
const DAY_CURVE = (() => {
  const w = [0.3, 0.15, 0.08, 0.05, 0.05, 0.1, 0.3, 0.6, 0.8, 0.7, 0.7, 0.8, 1.1, 1, 0.8, 0.8, 0.9, 1.1, 1.4, 1.7, 1.9, 1.8, 1.3, 0.7];
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
})();

/** Same string, same number in [0, 1): FNV-1a, then a mulberry32 round to spread it. */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return mulberry(h >>> 0)();
}

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Knuth's: means here are a few words an hour. */
function poisson(mean: number, rng: () => number): number {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  for (let p = rng(); p > limit; p *= rng()) k++;
  return k;
}

const between = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;

export interface Persona {
  /** Hours from UTC. */
  tz: number;
  perDay: number;
  days: number;
  winRate: number;
  missesPerWin: number;
  ceiling: number;
}

/** A bot's persona, always the same for its id. */
export function persona(id: string): Persona {
  const rng = mulberry(Math.floor(unit(id) * 2 ** 32));
  const c = CROWD;
  return {
    tz: Math.round(between([-8, 9], rng())),
    perDay: Math.min(c.perDay.max, Math.max(c.perDay.min, c.perDay.median * Math.exp(gauss(rng) * c.perDay.spread))),
    days: between(c.days, rng()),
    winRate: between(c.winRate, rng()),
    missesPerWin: between(c.missesPerWin, rng()),
    ceiling: Math.round(between(c.ceiling, rng() ** 0.7)),
  };
}

/** Tokens a word pays at a level: about levels.ts tokenReward (it's only a tiebreak). */
const pay = (level: number) => Math.min(5, Math.ceil(level / 2));
const levelOf = (words: number, p: Persona) => Math.min(p.ceiling, 1 + Math.floor(words / CROWD.wordsPerLevel));

/** One hour's play (or part of one): when its last word was won, and the counts. */
export interface Slice {
  at: number;
  won: number;
  lost: number;
  level: number;
  tokens: number;
  misses: number;
}

/** What bot `id`, with `words` so far, plays from `from` to `to` (ms), hour by hour. Hours without a round are left out. */
export function play(id: string, p: Persona, words: number, from: number, to: number, rng: () => number): Slice[] {
  const out: Slice[] = [];
  for (let a = from; a < to; ) {
    const b = Math.min(to, (Math.floor(a / HOUR) + 1) * HOUR);
    const local = a + p.tz * HOUR;
    const day = Math.floor(local / DAY);
    if (unit(`${id}:${day}`) < p.days) {
      // Day 0 (1970-01-01) was a Thursday: (day + 3) % 7 is 5 and 6 on the weekend.
      const weekend = (day + 3) % 7 >= 5 ? CROWD.weekend : 1;
      const mean = (p.perDay * weekend * DAY_CURVE[Math.floor(local / HOUR) % 24] * (b - a)) / HOUR;
      const won = poisson(mean, rng);
      const lost = poisson((mean * (1 - p.winRate)) / p.winRate, rng);
      if (won || lost) {
        const level = levelOf(words, p);
        const misses = lost * DEFAULT_MAX_WRONG + poisson(won * p.missesPerWin, rng);
        out.push({ at: a + rng() * (b - a), won, lost, level, tokens: won * pay(level), misses });
        words += won;
      }
    }
    a = b;
  }
  return out;
}

/** Same length as a sha256 hex (players.ts `owns` compares in constant time), and never equal to one. */
const NO_SECRET = '-'.repeat(64);
/** Two servers overlap on a redeploy: one moves the crowd at a time. */
const LOCK = 'SELECT pg_advisory_xact_lock(4207)';

/** `n` names no one holds, as players have them. */
async function freeNames(sql: Sql, n: number, rng: () => number): Promise<string[]> {
  const picked = new Map<string, string>();
  for (let tries = 0; picked.size < n && tries < 20; tries++) {
    const batch = Array.from({ length: 2 * (n - picked.size) }, () => botName('en', rng));
    const { rows } = await sql.query<{ name_key: string }>('SELECT name_key FROM players WHERE name_key = ANY($1)', [batch.map(nameKey)]);
    const taken = new Set(rows.map((r) => r.name_key));
    for (const name of batch) if (picked.size < n && !taken.has(nameKey(name)) && !picked.has(nameKey(name))) picked.set(nameKey(name), name);
  }
  return [...picked.values()];
}

/** Brings the crowd to `size` bots: new ones join with a past (advanceCrowd plays it), extra ones leave. Bots added (negative: removed). */
export async function fillCrowd(db: Db, size: number, now = Date.now(), rng: () => number = Math.random): Promise<number> {
  return db.tx(async (sql) => {
    await sql.query(LOCK);
    const { rows } = await sql.query<{ id: string }>('SELECT id FROM players WHERE bot ORDER BY created_at, id');
    if (rows.length >= size) {
      if (rows.length > size) await sql.query('DELETE FROM players WHERE id = ANY($1)', [rows.slice(size).map((r) => r.id)]);
      return size - rows.length;
    }
    const names = await freeNames(sql, size - rows.length, rng);
    await sql.query(
      `INSERT INTO players (id, secret_hash, bot, name, name_key, character_id, created_at, score_at, synced_at)
       SELECT id, $1, true, name, key, character, to_timestamp(at / 1000.0), to_timestamp(at / 1000.0), to_timestamp(at / 1000.0)
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::float8[]) AS b(id, name, key, character, at)`,
      [
        NO_SECRET,
        names.map(() => randomUUID()),
        names,
        names.map(nameKey),
        names.map(() => botCharacter(rng)),
        names.map(() => now - DAY * between(CROWD.joinedDays, rng() ** 2)),
      ],
    );
    return names.length;
  });
}

/** Plays every bot from where it was to `now`, in one transaction. Words won. */
export async function advanceCrowd(db: Db, now = Date.now(), rng: () => number = Math.random): Promise<number> {
  return db.tx(async (sql) => {
    await sql.query(LOCK);
    const { rows } = await sql.query<{ id: string; words: number; at: number }>(
      `SELECT id, words_guessed AS words, extract(epoch FROM synced_at)::float8 * 1000 AS at FROM players WHERE bot`,
    );
    const bots: { id: string; won: number; lost: number; level: number; tokens: number; misses: number; scoreAt: number | null }[] = [];
    const slices: (Slice & { id: string })[] = [];
    for (const bot of rows) {
      const p = persona(bot.id);
      const played = play(bot.id, p, bot.words, Math.max(bot.at, now - CROWD.catchUpDays * DAY), now, rng);
      const sum = (f: (s: Slice) => number) => played.reduce((n, s) => n + f(s), 0);
      const won = sum((s) => s.won);
      bots.push({
        id: bot.id,
        won,
        lost: sum((s) => s.lost),
        level: levelOf(bot.words + won, p),
        tokens: sum((s) => s.tokens),
        misses: sum((s) => s.misses),
        scoreAt: played.findLast((s) => s.won)?.at ?? null,
      });
      for (const s of played) slices.push({ id: bot.id, ...s });
    }
    if (!bots.length) return 0;
    const col = <K extends keyof (typeof bots)[number]>(k: K) => bots.map((b) => b[k]);
    await sql.query(
      `UPDATE players p SET
         words_guessed = p.words_guessed + b.won, level = b.level,
         rounds_played = p.rounds_played + b.won + b.lost, rounds_won = p.rounds_won + b.won,
         tokens_earned = p.tokens_earned + b.tokens, misses = p.misses + b.misses,
         score_at = coalesce(to_timestamp(b.score_at / 1000.0), p.score_at),
         synced_at = greatest(p.synced_at, to_timestamp($8 / 1000.0))
       FROM unnest($1::uuid[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[], $7::float8[])
         AS b(id, won, lost, level, tokens, misses, score_at)
       WHERE p.id = b.id`,
      [col('id'), col('won'), col('lost'), col('level'), col('tokens'), col('misses'), col('scoreAt'), now],
    );
    if (slices.length) {
      const of = <K extends keyof (typeof slices)[number]>(k: K) => slices.map((s) => s[k]);
      // As a sync's addRounds: lost rounds count too (misses), the week's board skips rows without a word.
      await sql.query(
        `INSERT INTO player_weeks (player_id, week, words, level, tokens_earned, misses, score_at)
         SELECT id, ${WEEK} AS week, sum(won), max(level), sum(tokens), sum(misses),
                to_timestamp(coalesce(max(at) FILTER (WHERE won > 0), min(at)) / 1000.0)
         FROM unnest($1::uuid[], $2::float8[], $3::int[], $4::int[], $5::int[], $6::int[]) AS s(id, at, won, level, tokens, misses)
         GROUP BY id, week ORDER BY id, week
         ON CONFLICT (player_id, week) DO UPDATE SET
           words = player_weeks.words + excluded.words,
           level = greatest(player_weeks.level, excluded.level),
           tokens_earned = player_weeks.tokens_earned + excluded.tokens_earned,
           misses = player_weeks.misses + excluded.misses,
           score_at = CASE WHEN excluded.words > 0 THEN excluded.score_at ELSE player_weeks.score_at END`,
        [of('id'), of('at'), of('won'), of('level'), of('tokens'), of('misses')],
      );
    }
    return bots.reduce((n, b) => n + b.won, 0);
  });
}

/**
 * Keeps `size` bots (LEADERBOARD_BOTS; 0 takes them all off the boards) and
 * plays them every CROWD.tickMs. A failed step is logged and the next one
 * catches up. Returns the stop, which waits for a step in flight.
 */
export function startCrowd(db: Db, size: number, log: { error(obj: object, msg: string): void }, tickMs: number = CROWD.tickMs) {
  let running: Promise<void> = Promise.resolve();
  const step = (work: () => Promise<unknown>) => {
    running = running.then(work).then(
      () => {},
      (err: unknown) => log.error({ err }, 'leaderboard bots: step failed'),
    );
  };
  step(() => fillCrowd(db, size));
  const timer = size > 0 ? setInterval(() => step(() => advanceCrowd(db)), tickMs) : null;
  if (size > 0) step(() => advanceCrowd(db));
  return async () => {
    if (timer) clearInterval(timer);
    await running;
  };
}
