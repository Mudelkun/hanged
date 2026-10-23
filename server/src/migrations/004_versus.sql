-- Versus (online multiplayer): the word details the server deals from, friends,
-- blocks, reports, ratings and the on/off switch. Matches themselves live in
-- the server's memory while they run; only their outcome is written, as
-- counters (like the rounds: storage grows with players, not with matches).

-- The server deals Versus words itself (the guesser's device never gets the word),
-- so it needs each word's clue and how familiar it is. npm run seed:words fills them.
ALTER TABLE words
  ADD COLUMN description text,
  ADD COLUMN subject     text,
  ADD COLUMN rarity      int,
  ADD COLUMN difficulty  int;

-- A friendship is two rows, one per side, so "my friends" is one index range.
CREATE TABLE friends (
  player_id  uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  friend_id  uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, friend_id),
  CHECK (player_id <> friend_id)
);

CREATE TABLE friend_requests (
  from_id    uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  to_id      uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id),
  CHECK (from_id <> to_id)
);
CREATE INDEX friend_requests_to ON friend_requests (to_id);

-- A block works both ways: no requests, invites, lobbies or matchmaking between the two.
CREATE TABLE blocks (
  player_id  uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, blocked_id),
  CHECK (player_id <> blocked_id)
);
CREATE INDEX blocks_blocked ON blocks (blocked_id);

-- App Store Guideline 1.2: players can report someone. One row per pair (a new report replaces the old).
CREATE TABLE player_reports (
  reporter_id uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  reason      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reporter_id, reported_id)
);
CREATE INDEX player_reports_reported ON player_reports (reported_id);

ALTER TABLE players
  ADD COLUMN versus_rating int NOT NULL DEFAULT 1000,  -- Elo, moved only by matchmade (ranked) matches
  ADD COLUMN versus_played int NOT NULL DEFAULT 0,
  ADD COLUMN versus_won    int NOT NULL DEFAULT 0;

-- Player search: a name's start, case and accents aside (name_key, names.ts).
CREATE INDEX players_name_prefix ON players (name_key text_pattern_ops) WHERE name_key IS NOT NULL;

-- Matches per day and mode, for the admin page. Never a row per match.
CREATE TABLE versus_days (
  day       date NOT NULL,
  mode      text NOT NULL,
  matches   int  NOT NULL DEFAULT 0,
  players   int  NOT NULL DEFAULT 0,
  forfeits  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (day, mode)
);

-- Server settings, e.g. 'versus' → { "enabled": true, "message": null } (the kill switch).
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
