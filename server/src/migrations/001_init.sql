-- Players, the weekly board, the word list and the word statistics.
-- No table keeps individual rounds: they are added into counters as they
-- arrive, so storage grows with players and words, not with rounds played.

CREATE TABLE players (
  id            uuid PRIMARY KEY,
  secret_hash   text NOT NULL,                  -- sha256 of the device's secret, hex
  name          text,                           -- null: the app shows its default name
  character_id  text NOT NULL DEFAULT 'mochi',
  language      text NOT NULL DEFAULT 'en',
  words_guessed int  NOT NULL DEFAULT 0,        -- the leaderboard score
  level         int  NOT NULL DEFAULT 1,
  tokens        int  NOT NULL DEFAULT 0,
  rounds_played int  NOT NULL DEFAULT 0,        -- from the round reports
  rounds_won    int  NOT NULL DEFAULT 0,
  last_seq      int  NOT NULL DEFAULT 0,        -- highest report seq taken
  score_at      timestamptz NOT NULL DEFAULT now(), -- when words_guessed last went up (ties: first there wins)
  created_at    timestamptz NOT NULL DEFAULT now(),
  synced_at     timestamptz                     -- null until the first sync
);
-- The all-time board's order, so the top and a player's rank read the index.
CREATE INDEX players_board ON players (words_guessed DESC, level DESC, score_at, id) WHERE words_guessed > 0;

CREATE TABLE player_weeks (
  player_id uuid NOT NULL REFERENCES players ON DELETE CASCADE,
  week      date NOT NULL,                      -- the Monday (UTC) the week starts on
  words     int  NOT NULL,
  score_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, week)
);
CREATE INDEX player_weeks_board ON player_weeks (week, words DESC, score_at, player_id);

-- A copy of data/words.json (npm run seed:words), for reading the statistics.
-- Not a foreign key target: a newer app may report words the server hasn't seeded yet.
CREATE TABLE words (
  id       text PRIMARY KEY,
  word     text NOT NULL CHECK (word ~ '^[a-z]{1,15}$'),
  language text NOT NULL,
  length   int  GENERATED ALWAYS AS (char_length(word)) STORED
);

-- One row per word per day (UTC).
CREATE TABLE word_days (
  word_id      text NOT NULL,
  day          date NOT NULL,
  played       int  NOT NULL,
  won          int  NOT NULL,
  wrong        int  NOT NULL,                   -- wrong guesses, summed
  descriptions int  NOT NULL,                   -- rounds where the description was bought
  letters      int  NOT NULL,                   -- rounds where letters were bought
  PRIMARY KEY (word_id, day)
);

-- Each word over all time: what's guessed most, what's lost most.
CREATE VIEW word_stats AS
SELECT d.word_id,
       w.word,
       w.length,
       sum(d.played)::int                                          AS played,
       sum(d.won)::int                                             AS won,
       (sum(d.played) - sum(d.won))::int                           AS lost,
       round(1 - sum(d.won)::numeric / nullif(sum(d.played), 0), 3) AS loss_rate,
       round(sum(d.wrong)::numeric / nullif(sum(d.played), 0), 2)   AS avg_wrong,
       sum(d.descriptions)::int                                    AS descriptions,
       sum(d.letters)::int                                         AS letters
FROM word_days d
LEFT JOIN words w ON w.id = d.word_id
GROUP BY d.word_id, w.word, w.length;
