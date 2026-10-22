/*
 * The leaderboard. Ranked by words guessed (CLAUDE.md: the score is the
 * number of words guessed, and spending tokens never lowers it). Ties go to
 * the higher level, then to whoever got there first.
 *   - all:  players.words_guessed
 *   - week: words guessed since Monday 00:00 UTC (player_weeks)
 * The top is the same for everyone, so it's cached for a few seconds; a
 * player's own rank is one indexed count.
 */
import { LIMITS, type LeaderboardEntry, type LeaderboardResponse, type Period } from './contract.ts';
import type { Db } from './db.ts';

const THIS_WEEK = `date_trunc('week', now() AT TIME ZONE 'UTC')::date`;

const TOP: Record<Period, string> = {
  all: `SELECT id AS "playerId", name, character_id AS "characterId", words_guessed AS words
        FROM players WHERE words_guessed > 0
        ORDER BY words_guessed DESC, level DESC, score_at, id LIMIT $1`,
  week: `SELECT p.id AS "playerId", p.name, p.character_id AS "characterId", w.words
         FROM player_weeks w JOIN players p ON p.id = w.player_id
         WHERE w.week = ${THIS_WEEK}
         ORDER BY w.words DESC, w.score_at, w.player_id LIMIT $1`,
};

/** The player's score and 1 + everyone ranked above them (same order as TOP). */
const ME: Record<Period, string> = {
  all: `SELECT p.words_guessed AS words, 1 + (
          SELECT count(*)::int FROM players o
          WHERE o.words_guessed > 0 AND (
            o.words_guessed > p.words_guessed
            OR (o.words_guessed = p.words_guessed AND o.level > p.level)
            OR (o.words_guessed = p.words_guessed AND o.level = p.level AND (o.score_at, o.id) < (p.score_at, p.id)))
        ) AS rank
        FROM players p WHERE p.id = $1 AND p.words_guessed > 0`,
  week: `SELECT w.words, 1 + (
           SELECT count(*)::int FROM player_weeks o
           WHERE o.week = w.week AND (
             o.words > w.words OR (o.words = w.words AND (o.score_at, o.player_id) < (w.score_at, w.player_id)))
         ) AS rank
         FROM player_weeks w WHERE w.player_id = $1 AND w.week = ${THIS_WEEK}`,
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
