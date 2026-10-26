-- Leaderboard bots (crowd.ts, owner's request 2026-10-26): simulated players who
-- keep the boards alive. Ordinary rows, so the boards, their indexes and every
-- rank need nothing new; `bot` keeps them out of everything else (friends
-- search, requests, reports) and lets the crowd find its own.
ALTER TABLE players ADD COLUMN bot boolean NOT NULL DEFAULT false;
CREATE INDEX players_bots ON players (created_at, id) WHERE bot;
