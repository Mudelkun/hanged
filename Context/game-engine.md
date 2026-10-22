# Game engine — the round rules

The core rules of CLAUDE.md, as pure TypeScript with no React and no storage:
[src/game/engine.ts](../src/game/engine.ts). Tests:
[src/game/__tests__/engine.test.ts](../src/game/__tests__/engine.test.ts).

## A round stores only what happened; everything else is derived

`Round` holds the word, its description, its `hints` (free hint words, snapshotted like
the description so a database change never alters a round in progress), `maxWrong`, the `clueLetters` given at the
start, the `disabledLetters` taken off the keyboard at the start, the `boughtLetters` paid for with tokens, the `guessed` letters in order, and `descriptionUnlocked`. That's all.
**Revealed letters, wrong count, status (`playing` / `won` / `lost`), scene stage,
key looks and tile looks are all computed from it** (`usedLetters`, `wrongCount`,
`roundStatus`, `sceneStage`, `keyState`, `tileState`).

Never add a stored `status`, `wrongCount` or `revealed` field. A derived value
that is also stored can disagree with the guesses. The C# original kept a separate
`tries` counter and a `char[11]` of tried letters, and that's exactly how its bugs
happened.

## Rules, and where each one lives

| Rule (CLAUDE.md) | Code |
|---|---|
| Letters only A–Z, 1–15 inclusive | `validateWord` — regex `^[a-z]+$`, then length. Never strips accents or swaps characters: an invalid word stays invalid. |
| One case internally | **lowercase** a–z everywhere in data and logic (like "Pendu"); the UI uppercases for display only. |
| Clues: at least one, more for longer words, at least one letter stays hidden | `clueCount(word, ratio)` = `clamp(round(distinct × ratio), minClues(word), distinct − 1)`. `ratio` comes from the level and the word: `levels.clueRatioFor` adds a bonus for a word whose measured `difficulty` is `HARD_WORD_MISSES` or more, so harder words get more clues. |
| Which letters are clues (long words: an edge; hard levels: the rarest) | `pickClueLetters(word, ratio, rng, frequency, rare)`: a long word's edge letters first (row above), then `rare` of the word's rarest letters, then random ones, up to `clueCount`. The rarest are by `frequency` (the round language's row in `LETTER_FREQUENCY`, config.ts; a language without one gets random clues). `createRound` takes `rareClues` from the level. The rare letters are the ones players can't find, so this is the strongest help there is: see [progression-and-tokens.md](progression-and-tokens.md), 20 levels. |
| The subject (free, from level 9) | `createRound` copies `subject` into the round only when given (the level shows it), so `round.subject` is absent on easy levels and in older saves. It's a key; the UI translates it. Never a rule. |
| Long words get at least 4 clues, on every level, starting with their first or last two letters (owner's call, 2026-10-22; it was 2 clues, no edge) | `minClues` is `LONG_WORD_CLUES` (4) for words of `LONG_WORD_LENGTH` (8, PLACEHOLDER) letters or more, else 1, capped as always so a letter stays hidden (a long word with 4 distinct letters shows 3). `edgeLetters(word, rng)` gives the first `EDGE_CLUES` (2) letters or the last 2, front or back at random, and `pickClueLetters` puts them first: the owner's point is that "RE…LE" is what makes "reasonable" recognisable. A doubled edge letter counts once ("aardvarks" → a). A test checks every long word in the database at the hardest level's ratio. |
| A clue reveals every occurrence and its key counts as used | Clues are stored as **letters**, not positions, so all occurrences follow automatically. `usedLetters = clues ∪ guessed`. |
| Easy levels disable some keys (owner's request) | `disabledCount(word, ratio)` = `clamp(round(decoys × ratio), 0, decoys − 1)`, where decoys = the letters **not** in the word (`decoyLetters`). `ratio` is the level's `disabledRatio`, 0 when omitted. A disabled letter is never in the word, so it can't change win/loss; it's in `usedLetters`, `keyState` says `off`, and `guess()` refuses it. At least one decoy always stays, so a miss is still possible. |
| Bought letters (owner's request, hardest level) | `buyLetters(r, count, rng)` reveals `count` random letters from `hiddenLetters(r)` into `boughtLetters`. `canBuyLetters` allows it once per round, while playing, and only if **more than `count`** distinct letters are hidden, so one always stays hidden (rule 4) and the player always gets all they paid for. Bought letters are in `usedLetters`, and `keyState` / `tileState` show them as `clue`. Price and which levels sell: [progression-and-tokens.md](progression-and-tokens.md). |
| No repeat guesses | `guess()` returns the **same object** for a used letter, a clue letter, a non a–z character, or a finished round. Callers can compare by reference (`next === prev`) to know nothing happened. |
| Lose at `maxWrong`, and input locks | `roundStatus` says `lost` exactly when `wrongCount >= maxWrong`; `guess()` refuses once status isn't `playing` (rule 9). |
| Balloons: one per allowed miss, each miss pops exactly one | `balloonsGone` (out of 10: `10 − maxWrong + wrong`) and `balloonsLeft` (= misses left). |
| Pose stage = `round(wrong × 10 / maxWrong)` | `sceneStage`. With `maxWrong` 6 the stages go 0, 2, 3, 5, 7, 8, 10, so the last miss always lands on 10. |

## The one conflict in the rules

"Every word gets at least one clue" and "at least one letter stays hidden" can't
both hold for a word with **a single distinct letter** ("a", "aaa").
**Keeping a letter hidden wins: such a word gets no clue.** The solo word list
avoids the case completely (`check-words` requires 2+ distinct letters). It
still matters for two-player typed words, which only need to pass `validateWord`.

## "Pendu" bugs: each has a test that keeps it from coming back

- 15-letter words rejected (`< 15`) → `accepts 1 to 15 letters, inclusive`
- accented letters accepted (`char.IsLetter`) → `accepts only plain A–Z`
- repeats no longer blocked after 11 guesses (`char[11]`) → `blocks repeat guesses, even after more than 11 guesses`
- no loss state / input stays enabled → `loses exactly at the 10th wrong guess, then locks input`
- no clues → clue tests

## Randomness is injectable

`pickClueLetters`, `pickDisabledLetters`, `createRound`, `buyLetters` and `pickWord` take an `rng` (default
`Math.random`) so tests can pin the result. Keep that parameter when you
change them.
