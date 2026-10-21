# Game engine — the round rules

The core rules of CLAUDE.md, as pure TypeScript with no React and no storage:
[src/game/engine.ts](../src/game/engine.ts). Tests:
[src/game/__tests__/engine.test.ts](../src/game/__tests__/engine.test.ts).

## A round stores only what happened; everything else is derived

`Round` holds the word, its description, its `hints` (free hint words, snapshotted like
the description so a database change never alters a round in progress), `maxWrong`, the `clueLetters` given at the
start, the `disabledLetters` taken off the keyboard at the start, the `guessed` letters in order, and `descriptionUnlocked`. That's all.
**Revealed letters, wrong count, status (`playing` / `won` / `lost`), hanging stage,
key looks and tile looks are all computed from it** (`usedLetters`, `wrongCount`,
`roundStatus`, `hangingStage`, `keyState`, `tileState`).

Never add a stored `status`, `wrongCount` or `revealed` field. A derived value
that is also stored can disagree with the guesses. The C# original kept a separate
`tries` counter and a `char[11]` of tried letters, and that's exactly how its bugs
happened.

## Rules, and where each one lives

| Rule (CLAUDE.md) | Code |
|---|---|
| Letters only A–Z, 1–15 inclusive | `validateWord` — regex `^[a-z]+$`, then length. Never strips accents or swaps characters: an invalid word stays invalid. |
| One case internally | **lowercase** a–z everywhere in data and logic (like "Pendu"); the UI uppercases for display only. |
| Clues: at least one, more for longer words, at least one letter stays hidden | `clueCount(word, ratio)` = `clamp(round(distinct × ratio), 1, distinct − 1)`. `ratio` comes from the level. |
| A clue reveals every occurrence and its key counts as used | Clues are stored as **letters**, not positions, so all occurrences follow automatically. `usedLetters = clues ∪ guessed`. |
| Easy levels disable some keys (owner's request) | `disabledCount(word, ratio)` = `clamp(round(decoys × ratio), 0, decoys − 1)`, where decoys = the letters **not** in the word (`decoyLetters`). `ratio` is the level's `disabledRatio`, 0 when omitted. A disabled letter is never in the word, so it can't change win/loss; it's in `usedLetters`, `keyState` says `off`, and `guess()` refuses it. At least one decoy always stays, so a miss is still possible. |
| No repeat guesses | `guess()` returns the **same object** for a used letter, a clue letter, a non a–z character, or a finished round. Callers can compare by reference (`next === prev`) to know nothing happened. |
| Lose at `maxWrong`, and input locks | `roundStatus` says `lost` exactly when `wrongCount >= maxWrong`; `guess()` refuses once status isn't `playing` (rule 9). |
| Stage = `round(wrong × 10 / maxWrong)` | `hangingStage`. With `maxWrong` 6 the stages go 0, 2, 3, 5, 7, 8, 10, so the last miss always lands on 10. |

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

`pickClueLetters`, `pickDisabledLetters`, `createRound` and `pickWord` take an `rng` (default
`Math.random`) so tests can pin the result. Keep that parameter when you
change them.
