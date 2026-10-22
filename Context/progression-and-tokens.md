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
  - `streakMeter(streak)` turns the streak into the stretch it's filling between two bonus steps (and laps
    past the last one). Only the streak takeover draws it ([play-screen.md](play-screen.md)); it reads
    `STREAK_BONUS_AT`, so changing the steps changes the meter too.
  - **The `tokenReward` values and `STREAK_BONUS_AT` are PLACEHOLDERS**, like the character prices built on them.
- Tokens are spent only on a description (`DESCRIPTION_COST` = 2), on bought letters (below) and on characters
  (`buyCharacter`, `CHARACTER_PRICES`: [characters-shop.md](characters-shop.md)). The character prices were set
  from a simulation of this token pay, so **changing the pay means re-checking those prices**.
- **Buying letters (owner's request)**: on a level with `sellsLetters` (levels 8–20, the hard
  ones), the `buyLetters` action reveals `LETTER_BUY_COUNT` (2) hidden letters for
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
- A round that moved the level plays the level path animation over its result and adds a line to
  it. It's detected as `state.levelProgress.level !== round.level`, with no extra saved field
  ([play-screen.md](play-screen.md)).

### 20 levels (owner's call, 2026-10-22)

**Why:** the owner wanted the words that are really hard to guess to wait for high levels, with
**more help as the words get harder**. So there are two tiers:
- **Levels 1–8: words most players can guess.** Everyday words, the measured difficulty capped low,
  random clue letters, wrong keys taken off the keyboard.
- **Levels 9–20: harder and harder words, with more help.** Each level deals a band of measured
  difficulty that climbs (8–11 misses on level 9 up to 19–25 on level 20; rare words from level 17).
  The help is the free **subject** (owner's call: from level 9), **letters to buy** (from level 8),
  wrong keys still taken off the keyboard up to level 16, and the strongest help, **the rarest
  letters as clues**: 1 of the clue letters on levels 11–12, 2 from level 13. The V of "virulent"
  is what players can't find, so it's what gets revealed.

Each `LEVELS` row sets the word-length range, `concreteOnly` (levels 1–4 deal only things you
can picture), `maxRarity` (20 on levels 1–2, 35 from level 3, 50 from level 17; see
[word-database.md](word-database.md), How hard a word is), the band `minDifficulty`–`maxDifficulty`
(measured misses: 0–4 on level 1 up to 0–8 on level 8, then the climbing bands above), the
`clueRatio` (a round uses `clueRatioFor(level, word)`: a word measured at `HARD_WORD_MISSES` (5) or
more adds `HARD_WORD_CLUE_BONUS` (0.2) from config.ts, so it gets about one more clue letter; levels
9–20 use 0, so they get the fewest clues plus that bonus), `rareClues` (how many clue letters are the word's rarest,
in its language's `LETTER_FREQUENCY` from config.ts; the rest stay random), `showsSubject`, the `disabledRatio` (share of the letters not in the word taken off the
keyboard: 0.5 at level 1 fading slowly to 0.15 on levels 13–15 and 0.05 on 16, a full keyboard
from 17; the biggest single help for a regular player, see below; a test keeps it
non-increasing and ending at 0), `maxWrong` (10 on every level: levels 7–8 used to allow 8 and 6,
and that made them lose-more-than-win for most players, measured in
[word-database.md](word-database.md); the rules allow fewer on the hardest levels, but measure first),
`tokenReward` (1 to 5, see Tokens above) and `sellsLetters` (from level 8). `levelByNumber` reads a row by a round's `level`.
A test keeps the table from ever taking help away or dealing easier words as levels rise.

**The owner's target (2026-10-22): a regular person wins about 75% of rounds on levels 1–15.**
[levels-fun.test.ts](../src/game/__tests__/levels-fun.test.ts) plays 300 real rounds of each level
with the stand-in for a regular person: a simulated player who recognises no words, tries the most
frequent letters, and never uses a hint, the subject or the description. It fails if that player
wins under **75% on levels 1–15** or under **50% on 16–20**, or if a level has under 250 words.
Today: 96 · 90 · 90 · 92 · 89 · 96 · 90 · 95 · 97 · 91 · 94 · 91 · 89 · 83 · 79% on levels 1–15,
then 66 · 67 · 56 · 60 · 67% on 16–20 (with long words showing 4 clues, edge first). This player
can't recognise a word, so it under-counts what the edge clues do for a real person.

Why this player and not a smarter one: a word-matching model that knows 10,000 words said levels
5–8 were 99% wins while the owner kept losing there ("reasonable" on level 6: 10 letters, 2 clues,
a full keyboard). The letter-guesser said 57–70%, which matched. What fixed it: **taking wrong keys
off the keyboard for longer** (it used to stop at level 6). That one column took levels 3–15 from
57–82% to 77–96%. Revealing the rarest letters is the other strong help: with random clues, this
player fell to 10–20% on levels 13–20. It's so strong that from level 9 together with the keyboard
it made levels a 100% walk, which is why it starts at level 11 and the second rare letter waits for
level 13. Tune the table against this test, not by feel, and once real players play, check it against
the real win rates the server records for every round.

**Every number in `LEVELS`, `WORDS_PER_LEVEL`, `LOSSES_TO_DROP`, `LEVEL_GRACE_ROUNDS` and
`STARTING_TOKENS` (3) is a PLACEHOLDER.** The owner hasn't answered the clue-formula, progression and
starting-token questions in CLAUDE.md. Change them only in those two files,
and update this doc when you do.

A round snapshots its `level`, `maxWrong`, clue and disabled letters and its `subject` (only on a
level that shows it) when it starts, so a level-up never changes a round in progress.

**Not built yet (screens, waiting for the other Play-screen work to land):** showing `round.subject`
(the label is `subjects.<key>` in en.json, one per key in `SUBJECTS`, scripts/words-rules.js), 20
level colours (theme `levelColors` has 8 and wraps), and checking the level path reads well with 20
stops (it scrolls, so it works).

## Word picking

`nextWord(state)` → `pickWord(level, language, seenWordIds)` in [words.ts](../src/game/words.ts).
**Owner's rules: the order is random, and a word never comes back before the player has gone
through every word available to them.**
- A level deals from its pool, `levelPool(level, language)`: the words in its length range that are
  of the right kind (only things on `concreteOnly` levels), common enough (`rarity <= maxRarity`)
  and not too hard to guess (`difficulty <= maxDifficulty`), cached per level. If none fit, the
  closest lengths first, then the right kind, then the most common, then the easiest words among
  those: length is the main difficulty, the rest only narrow it. Without them, 20,000 dictionary
  words would deal "badly" or "ecru" on level 1 and "magnesium" on level 7.
- `pickWord` picks at random among the pool words not in `seenWordIds`. Random picks from what's
  left = a freshly shuffled deck, so every player and every cycle gets a different order.
- When the whole pool has been seen, the level **starts over**: `pickWord` deals a seen word (never
  the word just played, the last id of `seenWordIds`), and the reducer's `seenWord` sees the repeat
  and removes the pool's other ids from the list. So "a seen word was dealt" is the only reset
  signal and nothing else needs saving.
- `seenWordIds` is saved, oldest first, and grows to at most the size of the database. Pools of
  neighbouring levels overlap, so a word seen on level 3 still counts as seen on level 4.
- A round in progress is saved and restored, so reopening the app shows the same word: that's
  on purpose (no skipping a hard word), not a repeat.

## Saving (on the device; the server gets a copy)

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
- A save from before the Characters page has no `unlockedCharacterIds`: `[]` from `initialState()`.
  `hydrate` also keeps the picked character owned ([characters-shop.md](characters-shop.md)). Same key, no bump.
- A save from before the seen list has `recentWordIds` (the last 40 words, newest first). `hydrate`
  turns it into `seenWordIds` (reversed) and drops it. Same key, no bump. Ids of words no longer in the
  database are pruned from `seenWordIds` on every load.
- A save from before levels could drop has no `levelProgress`. `hydrate` rebuilds it from the score
  (`levelFromScore`: same level as before, the words past that level's start as `wins`). Same key, no bump.
- **`hydrate` gets the save exactly as stored** and fills missing fields from `initialState()` itself
  (`withDefaults`). `GameContext` must not merge first, or `hydrate` can't tell an old save from a new one.
- The **round in progress is saved too**. Killing the app does not deal a new word,
  so a player can't skip a hard word by restarting. A round restored already
  finished opens straight on its result screen.
- **This save is the source of truth** (offline first, owner's call 2026-10-21). The server only
  receives a copy for the leaderboard and the word statistics ([server.md](server.md)).
- **Round reports**: the step that wins or loses a round also queues a report in `reports` (the outbox,
  at most `REPORTS_KEPT`) and bumps `nextReportSeq`. The `guess` action carries `at` (now), so the
  reducer stays pure. `reportsSent(upTo)` drops what the server confirmed. Old saves get `[]` and 1 from
  `initialState()`. Same key, no bump.
- The save is still trivially editable. The server's score can only grow by reported wins after the first
  sync, so editing `wordsGuessed` alone does nothing there ([server.md](server.md)).
