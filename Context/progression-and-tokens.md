# Progression, score, tokens and saving

Player state + the one reducer that changes it:
[src/game/progress.ts](../src/game/progress.ts). Tuning:
[src/game/config.ts](../src/game/config.ts) and [src/game/levels.ts](../src/game/levels.ts).
React wrapper + device storage: [src/state/GameContext.tsx](../src/state/GameContext.tsx).
Tests: [src/game/__tests__/progress.test.ts](../src/game/__tests__/progress.test.ts).

## Scoring happens inside the winning guess

`gameReducer`'s `guess` case scores in the **same step** that makes the round
`won`. It adds +1 to `wordsGuessed` and to `streak`, and pays `tokenReward(round.level, streak)` tokens.
The step that makes a round `lost` resets `streak` to 0. Both steps also move the level
(`afterRound`, see Levels below), so a round can't count toward a level twice either. A finished round ignores further guesses (the engine
returns the same round), so **a word can never be scored twice**. Don't move
scoring into an effect or a "round over" screen. Re-renders and app restarts
would then count it again.

- **Score = `wordsGuessed`** (the leaderboard number). Spending tokens never lowers it.
- **Tokens: harder words pay more, and a streak adds a small bonus.** A win pays its level's
  `tokenReward` (the `LEVELS` column: 1, 1, 2, 2, 3, 3, 4, 4), plus +1 for each `STREAK_BONUS_AT`
  step the streak has reached (3, 6, 10 in a row, so the bonus is capped at +3).
  **Why:** the old "Nth win in a row pays N" ignored difficulty. Easy levels are easy to streak on,
  so a new player hit the cap on level-1 words while a level-8 player (6 wrong guesses) rarely
  could. That made easy words worth more than hard ones. Keep both rules: the level pay never
  shrinks as levels rise, and the streak bonus stays small next to it (tests check the first).
  - The **round's** snapshotted `level` pays, not the level the win moves the player up to.
  - A lost round resets `streak` to 0, so the next win pays the base again. Nothing else breaks a
    streak: the round in progress is saved, so restarting the app can't skip a word, and the
    description unlock doesn't count. `streak` is saved; an older save gets 0 from `initialState()`.
  - **The `tokenReward` values and `STREAK_BONUS_AT` are PLACEHOLDERS** until character prices exist.
- Tokens are spent only on a description (`DESCRIPTION_COST` = 2), on bought letters (below) and, later, on characters.
- **Buying letters (owner's request)**: on a level with `sellsLetters` (only level 8: 10–15 letters,
  12% clues), the `buyLetters` action reveals `LETTER_BUY_COUNT` (2) hidden letters for
  `LETTER_BUY_COST` (10) tokens, **once per round**. `lettersForSale(state)` says whether the round
  can still take them; the reducer also checks the balance. The engine refuses when 2 or fewer distinct
  letters are hidden, so one always stays hidden and **buying never wins a round**: scoring stays in
  the winning guess. Like the description, it doesn't break a streak. To sell letters on more levels,
  flip `sellsLetters` in `LEVELS`.
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

## Levels: up with wins, down with losses in a row

Difficulty is progressive and the player never picks it. The level is **saved state**,
`levelProgress` (`level`, `wins`, `rounds`, `losses`), not computed from the score, because
it can go down while the score never does. `afterRound(levelProgress, won)` in
[levels.ts](../src/game/levels.ts) is the only thing that moves it:

- **Up**: `WORDS_PER_LEVEL` (10) words guessed **on this level** move the player up one, capped at the last level.
- **Down (owner's call)**: `LOSSES_TO_DROP` (3) rounds lost **in a row** move the player down one,
  never below level 1. Any win clears the run.
- **Grace**: the first `LEVEL_GRACE_ROUNDS` (3) rounds on a level never count toward a drop, so a fresh
  level-up gets a few tries and drops can't chain.
- Every count restarts at 0 on a level change, so climbing back after a drop takes the full 10 wins.
- **Why not drop on every loss**: one unlucky word would yo-yo the level and progress would stop feeling
  real. **Why a drop at all**: a player stuck on a level that's too hard (6 wrong guesses, 15 letters)
  would lose forever. The 3-in-a-row + grace + 10-wins-back combination also limits losing on purpose
  to farm easy words for the leaderboard (an easy word counts the same as a hard one there).
- The result screen says "Back to level N. You've got this!" when the loss dropped the level
  (`state.levelProgress.level < round.level`, no extra saved field) ([play-screen.md](play-screen.md)).

Each `LEVELS` row sets the word-length range, the
`clueRatio`, the `disabledRatio` (share of the letters not in the word taken off the
keyboard: 0.5 at level 1, minus 0.1 per level, 0 from level 6; a test keeps it
non-increasing and ending at 0), `maxWrong` (10 until level 7, then 8, then 6),
`tokenReward` (see Tokens above) and `sellsLetters` (only level 8). `levelByNumber` reads a row by a round's `level`.

**Every number in `LEVELS`, `WORDS_PER_LEVEL`, `LOSSES_TO_DROP`, `LEVEL_GRACE_ROUNDS` and
`STARTING_TOKENS` (3) is a PLACEHOLDER.** The owner hasn't answered the clue-formula, progression and
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
- A save from before bought letters existed has rounds without `boughtLetters`. `hydrate`
  sets `[]`. Same key, no bump.
- A save from before levels could drop has no `levelProgress`. `hydrate` rebuilds it from the score
  (`levelFromScore`: same level as before, the words past that level's start as `wins`). Same key, no bump.
- **`hydrate` gets the save exactly as stored** and fills missing fields from `initialState()` itself
  (`withDefaults`). `GameContext` must not merge first, or `hydrate` can't tell an old save from a new one.
- The **round in progress is saved too**. Killing the app does not deal a new word,
  so a player can't skip a hard word by restarting. A round restored already
  finished opens straight on its result screen.
- This is device-local and trivially editable. Real tokens and the leaderboard
  need the server (accounts are an open question). Treat this storage as a cache
  of the future server state, not the source of truth.
