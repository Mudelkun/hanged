# Progression, score, tokens and saving

Player state + the one reducer that changes it:
[src/game/progress.ts](../src/game/progress.ts). Tuning:
[src/game/config.ts](../src/game/config.ts) and [src/game/levels.ts](../src/game/levels.ts).
React wrapper + device storage: [src/state/GameContext.tsx](../src/state/GameContext.tsx).
Tests: [src/game/__tests__/progress.test.ts](../src/game/__tests__/progress.test.ts).

## Scoring happens inside the winning guess

`gameReducer`'s `guess` case scores in the **same step** that makes the round
`won`. It adds +1 to `wordsGuessed` and +1 to `wordsTowardToken`, and at `WORDS_PER_TOKEN` (2) it
pays 1 token and resets to 0. A finished round ignores further guesses (the engine
returns the same round), so **a word can never be scored twice**. Don't move
scoring into an effect or a "round over" screen. Re-renders and app restarts
would then count it again.

- **Score = `wordsGuessed`** (the leaderboard number). Spending tokens never lowers it.
- **Tokens**: earned 1 per `WORDS_PER_TOKEN` (2) words. Spent only on a description
  (`DESCRIPTION_COST` = 1) and, later, on characters. `wordsTowardToken` is stored
  on its own rather than derived from `wordsGuessed % WORDS_PER_TOKEN`. Later, if online words
  count for the score but not for tokens (an open question), the two will diverge.
- **Changing the rate**: `hydrate` pays out a save that holds more progress than
  the current rate needs (it was 5 words, now 2): whole tokens go to the balance
  and the remainder stays as progress. So a rate change never strands a player at
  "4 / 2".
- `lastTokenEarned` flags the win that paid a token (the result screen shows
  "+1 token"). The next `newRound` clears it.
- `unlockDescription` is refused without enough tokens, when it's already unlocked,
  or once the round is over. The result screens always show the description for free.

## Levels: placeholders in one table

Difficulty is progressive and the player never picks it. `levelFor(wordsGuessed)`
is `1 + floor(wordsGuessed / WORDS_PER_LEVEL)`, capped at the last level, so it
**never drops back down**. Each `LEVELS` row sets the word-length range, the
`clueRatio` and `maxWrong` (10 until level 7, then 8, then 6).

**Every number in `LEVELS`, `WORDS_PER_LEVEL` and `STARTING_TOKENS` (3) is a
PLACEHOLDER.** The owner hasn't answered the clue-formula, progression and
starting-token questions in CLAUDE.md. Change them only in those two files,
and update this doc when you do.

A round snapshots its `level` and `maxWrong` when it starts, so a level-up never
changes a round in progress.

## Word picking

`nextWord(state)` → `pickWord(level, language, recentWordIds)`. It never repeats
any of the last `RECENT_WORDS_MEMORY` (40) words. If the filters leave nothing, it
first drops the "recent" filter, then picks the closest length. See
[word-database.md](word-database.md).

## Saving (no backend yet)

Everything (score, tokens, settings, the round in progress) is one JSON blob
in **AsyncStorage**, key `hanged.game.v1`, written after every state change.
`version: 1` is checked on load. A breaking shape change must bump the key or
migrate, never silently reuse it. An unreadable save starts a fresh player.

- The **round in progress is saved too**. Killing the app does not deal a new word,
  so a player can't skip a hard word by restarting. A round restored already
  finished opens straight on its result screen.
- This is device-local and trivially editable. Real tokens and the leaderboard
  need the server (accounts are an open question). Treat this storage as a cache
  of the future server state, not the source of truth.
