# Progression, score, tokens and saving

Player state + the one reducer that changes it:
[src/game/progress.ts](../src/game/progress.ts). Tuning:
[src/game/config.ts](../src/game/config.ts) and [src/game/levels.ts](../src/game/levels.ts).
React wrapper + device storage: [src/state/GameContext.tsx](../src/state/GameContext.tsx).
Tests: [src/game/__tests__/progress.test.ts](../src/game/__tests__/progress.test.ts).

## Scoring happens inside the winning guess

`gameReducer`'s `guess` case scores in the **same step** that makes the round
`won`. It adds +1 to `wordsGuessed` and to `streak`, and pays `tokenReward(streak)` tokens.
The step that makes a round `lost` resets `streak` to 0. A finished round ignores further guesses (the engine
returns the same round), so **a word can never be scored twice**. Don't move
scoring into an effect or a "round over" screen. Re-renders and app restarts
would then count it again.

- **Score = `wordsGuessed`** (the leaderboard number). Spending tokens never lowers it.
- **Tokens: words in a row pay more.** The Nth win of a streak pays N tokens
  (`tokenReward(streak)` = `min(streak, MAX_STREAK_REWARD)`), so 1, 2, 3… A lost round
  resets `streak` to 0 and the next win pays 1 again. Nothing else breaks a streak: the round in
  progress is saved, so restarting the app can't skip a word, and the description unlock doesn't count.
  **`MAX_STREAK_REWARD` (10) is a PLACEHOLDER** cap so a long streak on easy words can't flood
  the economy before character prices exist. `streak` is saved; an older save gets 0 from
  `initialState()` when it loads.
- Tokens are spent only on a description (`DESCRIPTION_COST` = 1) and, later, on characters.
- **Old saves**: the "N words per token" rate (5, then 2, then 1) and its `wordsTowardToken`
  field and "Next token" bar are gone, because a progress bar can't show payouts that vary.
  `hydrate` pays a leftover `wordsTowardToken` as 1 token per word (the last rate), maps the old
  boolean `lastTokenEarned` to `lastTokensEarned`, and drops both fields. Same key, no bump.
- **Hint words are free**: they never touch tokens or the reducer. Which hint is showing
  is UI state in `HintPill` ([play-screen.md](play-screen.md)), not saved.
- `lastTokensEarned` is what the winning guess paid (the result screen shows
  "+N tokens"). The next `newRound` sets it back to 0.
- `unlockDescription` is refused without enough tokens, when it's already unlocked,
  or once the round is over. The result screens always show the description for free.

## Levels: placeholders in one table

Difficulty is progressive and the player never picks it. `levelFor(wordsGuessed)`
is `1 + floor(wordsGuessed / WORDS_PER_LEVEL)`, capped at the last level, so it
**never drops back down**. Each `LEVELS` row sets the word-length range, the
`clueRatio`, the `disabledRatio` (share of the letters not in the word taken off the
keyboard: 0.5 at level 1, minus 0.1 per level, 0 from level 6; a test keeps it
non-increasing and ending at 0) and `maxWrong` (10 until level 7, then 8, then 6).

**Every number in `LEVELS`, `WORDS_PER_LEVEL` and `STARTING_TOKENS` (3) is a
PLACEHOLDER.** The owner hasn't answered the clue-formula, progression and
starting-token questions in CLAUDE.md. Change them only in those two files,
and update this doc when you do.

A round snapshots its `level`, `maxWrong` and disabled letters when it starts, so a level-up never
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

- A save from before hint words existed has rounds without `hints`. `hydrate` fills them
  in from the word database (`wordById`), or `[]` if the word is gone. Same key, no bump.
- A save from before disabled keys existed has rounds without `disabledLetters`. `hydrate`
  sets `[]` (full keyboard), so the round plays on as it started. Same key, no bump.
- The **round in progress is saved too**. Killing the app does not deal a new word,
  so a player can't skip a hard word by restarting. A round restored already
  finished opens straight on its result screen.
- This is device-local and trivially editable. Real tokens and the leaderboard
  need the server (accounts are an open question). Treat this storage as a cache
  of the future server state, not the source of truth.
