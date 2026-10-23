/*
 * The leaderboard. Ranked by words guessed (CLAUDE.md: the score is the
 * number of words guessed, and spending tokens never lowers it). Ties go to
 * the higher level, then to more tokens earned (earned, never the balance,
 * so spending can't drop a rank), then to fewer wrong guesses, then to
 * whoever got there first.
 *   - all:  players: words_guessed, the current level, all-time totals
 *   - week: player_weeks: since Monday 00:00 UTC, the highest level played that week
 * The top is the same for everyone, so it's cached for a few seconds; a
 * player's own rank is one indexed count.
 */
import { LIMITS, type LeaderboardEntry, type LeaderboardResponse, type Period } from './contract.ts';
import type { Db } from './db.ts';

const THIS_WEEK = `date_trunc('week', now() AT TIME ZONE 'UTC')::date`;

/**
 * Each board's order as one row that sorts ascending, best first (the
 * descending columns negated). Migration 003 indexes the same expressions, so
 * ORDER BY and the row comparison in ME both read the index.
 */
const ORDER: Record<Period, (t: string) => string> = {
  all: (t) => `-${t}.words_guessed, -${t}.level, -${t}.tokens_earned, ${t}.misses, ${t}.score_at, ${t}.id`,
  week: (t) => `-${t}.words, -${t}.level, -${t}.tokens_earned, ${t}.misses, ${t}.score_at, ${t}.player_id`,
};

const TOP: Record<Period, string> = {
  all: `SELECT p.id AS "playerId", p.name, p.character_id AS "characterId", p.words_guessed AS words
        FROM players p WHERE p.words_guessed > 0
        ORDER BY ${ORDER.all('p')} LIMIT $1`,
  week: `SELECT p.id AS "playerId", p.name, p.character_id AS "characterId", w.words
         FROM player_weeks w JOIN players p ON p.id = w.player_id
         WHERE w.week = ${THIS_WEEK} AND w.words > 0
         ORDER BY ${ORDER.week('w')} LIMIT $1`,
};

/** The player's score and 1 + everyone ranked above them (same order as TOP). */
const ME: Record<Period, string> = {
  all: `SELECT p.words_guessed AS words, 1 + (
          SELECT count(*)::int FROM players o
          WHERE o.words_guessed > 0 AND (${ORDER.all('o')}) < (${ORDER.all('p')})
        ) AS rank
        FROM players p WHERE p.id = $1 AND p.words_guessed > 0`,
  week: `SELECT w.words, 1 + (
           SELECT count(*)::int FROM player_weeks o
           WHERE o.week = w.week AND o.words > 0 AND (${ORDER.week('o')}) < (${ORDER.week('w')})
         ) AS rank
         FROM player_weeks w WHERE w.player_id = $1 AND w.week = ${THIS_WEEK} AND w.words > 0`,
};

export function createLeaderboard(db: Db, ttlMs = 10_000) {
  const cache = new Map<Period, { until: number; entries: Promise<LeaderboardEntry[]> }>();

  function top(period: Period): Promise<LeaderboardEntry[]> {
    const hit = cache.get(period);
    if (hit && hit.until > Date.now()) return hit.entries;
    const entries = db
      .query<Omit<LeaderboardEntry, 'rank'>>(TOP[period], [LIMITS.boardSize])
      .then(({ rows }) => rows.map((r, i) => ({ rank: i + 1, ...r })));
    // Concurrent requests share one query; a failed one isn't kept.
    cache.set(period, { until: Date.now() + ttlMs, entries });
    entries.catch(() => cache.delete(period));
    return entries;
  }

  return async function leaderboard(period: Period, me?: string): Promise<LeaderboardResponse> {
    const [entries, mine] = await Promise.all([
      top(period),
      me ? db.query<{ words: number; rank: number }>(ME[period], [me]) : null,
    ]);
    return { period, entries, me: mine?.rows[0] ?? null };
  };
}
