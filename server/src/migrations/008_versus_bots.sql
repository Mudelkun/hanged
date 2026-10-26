-- Versus bots (versus/bots.ts): matches where bots filled the seats nobody else
-- took, per day and mode, so the admin page shows how many matches had real
-- opponents. `players` counts only real players.
ALTER TABLE versus_days ADD COLUMN bot_matches int NOT NULL DEFAULT 0;
