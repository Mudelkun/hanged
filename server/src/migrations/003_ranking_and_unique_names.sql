-- Ties on the boards (owner's call, 2026-10-23): words guessed, then level,
-- then tokens earned (never the balance: spending must not lower a rank),
-- then fewest wrong guesses, then whoever got there first.
-- And player names are unique (owner's call, 2026-10-23).

ALTER TABLE players
  ADD COLUMN tokens_earned int NOT NULL DEFAULT 0,   -- summed from the round reports, never goes down
  ADD COLUMN misses        int NOT NULL DEFAULT 0,   -- wrong guesses, summed from the round reports
  ADD COLUMN name_key      text;                     -- names.ts nameKey(name): case, accents, spaces and - _ . ' aside

ALTER TABLE player_weeks
  ADD COLUMN level         int NOT NULL DEFAULT 1,   -- the highest level played that week
  ADD COLUMN tokens_earned int NOT NULL DEFAULT 0,
  ADD COLUMN misses        int NOT NULL DEFAULT 0;

-- Rows from before this migration get their key on their next sync (every sync sends the name).
CREATE UNIQUE INDEX players_name_key ON players (name_key);

-- Each board's order as one ascending row (leaderboard.ts), so the top and a player's rank read the index.
DROP INDEX players_board;
CREATE INDEX players_board ON players ((-words_guessed), (-level), (-tokens_earned), misses, score_at, id)
  WHERE words_guessed > 0;

-- Rounds lost now add a week row too (misses), so a week's board skips rows without a word.
DROP INDEX player_weeks_board;
CREATE INDEX player_weeks_board ON player_weeks (week, (-words), (-level), (-tokens_earned), misses, score_at, player_id)
  WHERE words > 0;
