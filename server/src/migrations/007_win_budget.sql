-- Anti-cheat (players.ts, winBudget): reported wins are a budget that refills
-- at a human pace. `wins_tat` is the budget's theoretical arrival time (GCRA),
-- in epoch ms; null = never spent (a full budget).
ALTER TABLE players ADD COLUMN wins_tat double precision;
