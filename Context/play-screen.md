# The Play screen (and the round result)

Route: [src/app/(tabs)/index.tsx](../src/app/(tabs)/index.tsx). It follows the **Play** and
**Round lost** phones in [design/ui-mockup.png](../design/ui-mockup.png).
Sizes, radii and colours are copied from the CSS in
[design/ui-mockup.html](../design/ui-mockup.html), and the palette lives in
[src/theme](../src/theme/index.ts). When the mockup changes, diff its CSS against
these components.

## Two layouts on one screen

- **Playing**: header · scene · miss pips · word tiles · hint pill · letter shop pill (levels that sell letters) · description card · keyboard · tab bar.
- **Result** (won or lost): header · bigger scene + rubber stamp ("POPPED !!" red /
  "SAVED !!" green) · "10 / 10 misses · the word was" · full word · description
  (always unlocked) · **Next word** · tab bar. A round that moved the level adds a line under the
  misses line, in the new level's colour: "Level up! Welcome to level N." or "Back to level N. You've
  got this!" (encouraging, never a penalty message).
- There is **no "Next token" bar**: words guessed in a row pay more tokens
  ([progression-and-tokens.md](progression-and-tokens.md)), so the win line's badge carries the
  reward: "+N tokens" (`lastTokensEarned`), plus "· N in a row" once the streak is 2 or more (the streak
  itself is celebrated just before, by the streak takeover). This differs from the mockup, which still shows "1 / 2 words".

## Words in a row: the streak takeover (owner's idea, not in the mockup)

A win that makes a streak of `STREAK_SHOWN_FROM` (2) or more plays `StreakTakeover` **between the round
and its result**. It's an overlay on the body (header and tab bar stay, so the reward can fly into the
counter): after the `RESULT_DELAY` it fades in over the finished round, and as it closes it calls
`onReveal` (the result, with its stamp, goes in underneath) and dissolves onto it, growing slightly; only
then `onDone` unmounts it (`streakGone`).
- **Never swap the body to an empty screen around it.** An earlier version replaced the play layout and
  showed the result only after its fade-out: the card shrank onto blank paper, then the result and stamp
  cut in. The owner saw that as a big glitch. Both ends must cross-fade over real content.
- `onReveal`/`onDone` must stay stable (`useCallback`): the takeover's effects depend on them, and a new
  identity mid-animation would replay the cell landing.
- The overlay sits at `bottom: 0` so no keyboard key peeks under the card, and `zIndex: 10` so the result's
  stamp (`zIndex: 2`) can't draw over it on iOS.

- **The meter** is a tube of cells, one per word, from one streak-bonus step to the next
  (`streakMeter` in [progress.ts](../src/game/progress.ts): 0→3, 3→6, 6→10, then laps of 4 at the maxed
  bonus). Past cells are filled; this win's cell fills from the bottom (`scaleY`, `transformOrigin: bottom`),
  its star pops and the count ticks from N−1 to N. A line says what's next ("2 more words for a +2 bonus").
- **Each stretch has its own look** (`streakColors` in [src/theme](../src/theme/index.ts)): mint on a sky,
  gold sunburst, berry candy, starry indigo once the bonus is maxed. Sky, sunburst, cells, sign shadow and
  hint text all come from it.
- **The bonus moment**: when the win fills the meter, the goal star on top lights, the card flashes, the meter
  pulses, two `Confetti` poppers fire from the bottom corners, the title becomes "Streak bonus!" (or
  "Unstoppable!" on a maxed lap) and a butter ribbon announces the bonus. Success haptic.
- **Tokens**: the reward flies from the count into the counter when the cell lands (or on skip), so the
  result's badge doesn't send it again (`rewardFlown`). It lands well inside the pill's 4 s wait.
- **Timing**: closes by itself 1.15 s after the cell lands, or 2 s after the bonus moment (about 2.5 s / 3.6 s
  in all). A tap closes it, but not in its first 450 ms (a late tap meant for the last key).
- **Sizes come from the stage's measured height** (`stageSizes`), so the meter and the cheering character
  fill a tall phone and still fit an iPhone SE. Checked at 393×852 and 375×667 on every tier.
- It plays once: a round restored already finished opens on its result. The character is the full rig in the
  `cheer` pose (`bodyXml`), drawn once and hopped with native transforms, not re-rendered per frame.

## Level change: the level path (owner's idea, not in the mockup)

**Each level has its own colour** (`levelColors` in [src/theme](../src/theme/index.ts), calm to hot:
mint, sky, lilac, gold, tangerine, coral, berry, indigo). The header's `Lv N` pill, the path and the
result's level line use it.

When a round moves the level, `LevelChange` pops a card over the result, `APPEAR_MS` (1100 ms) after
it shows, so the stamp and the token flight come first. The card holds the **level path**: a winding
road of numbered stops, level 1 at the bottom, drawn in react-native-svg. Reached stops are filled
and raised in their colour; stops ahead are pale and dashed. The player's **character avatar** stands
on its stop and travels to the new one: it hops up (the road fills in the new level's colour, the stop
pops, sparkles burst, success haptic) or slides down (the road empties, the old stop turns pale again,
a light tap). The window's "camera" follows the character, so all 8 levels fit any phone; its top and
bottom fade into the paper. The button ("Let's go!" / "Keep going") fades the card out and **deals the
next word**, so the player taps once, not "Let's go!" and then "Next word" (owner's call).

- **The header waits for it**: until the character lands, the header keeps the round's level, then
  `Lv N` changes colour and pops (`onLanded`), the same idea as tokens waiting for their flight.
- **It plays once**: not for a round restored already finished (`restoredId`). The new round its
  button deals unmounts it. "Next word" before the card appears skips it.
- **The card has `zIndex: 10`.** On iOS, `zIndex` becomes a native layer depth that ignores the
  parent's stacking order, so the stamp's `zIndex: 2` drew over the card on a phone even though the
  card comes later in the tree. Anything drawn over the result needs a zIndex above 2.
- Positions come from one `geometry()`: each stretch is an S-curve leaving and entering stops straight
  up, and the character and camera follow 8 samples of it. The road's fill is an SVG dash offset,
  which can't use the native driver, so it runs as its own JS-driven value in step with the travel.
- Checked on web at 393×852 and 375×667 (both directions); the card fits without scrolling.

When a round ends, the play layout **stays for a moment** (`RESULT_DELAY`: lost
2600 ms so the last pop, the fall and the landing play (stage 10 lasts 2200 ms), won 700 ms so the last tile pops). Then the result
appears and the stamp pops. Input is already locked during that delay because
the engine refuses guesses. The "which round is showing its result" check is
by `round.id`, so a round restored already finished opens straight on its result.

On a loss, tiles the player found turn **mint**, and letters they missed turn
**coral** (mockup). On a win, clue tiles stay butter and guessed ones are mint.

## Components ([src/components](../src/components))

| File | What |
|---|---|
| `GameHeader.tsx` | Avatar button (will open Profile; disabled now), **player name** (never the app name; default "Player" until Profile exists), words guessed, `Lv N` in the level's colour (pops when it changes), token pill. |
| `LevelChange.tsx` | The level path card (see Level change above). |
| `StreakTakeover.tsx` | The streak meter takeover (see Words in a row above). |
| `Confetti.tsx` | A party-popper burst driven by one value, native driver only. `seed` and `aim` per popper. Reuse it for any big celebration. Pieces flutter with a flat `scaleY`, **never `rotateX`** (see the 3D trap in [dev-setup.md](dev-setup.md)). |
| `SparkBurst.tsx` | The sparkle ring thrown out as a value runs 0 → 1. Shared by the token pill's gain and a level-up; reuse it for any new celebration. |
| `TokenPill.tsx` | The header's token counter. Its number only changes when a **token flight** lands, then counts one token at a time (about 700 ms in total, whatever the amount). **Gain**: the coin flips once per token, the pill pops and sparkles burst. **Spend**: the pill squishes and the coin wobbles. A change that no origin claims within 4 s is counted in place (a slow phone can take over a second to show the win badge). The balance it mounts with never animates; this is safe because Play only mounts after the save loads. |
| `TokenFlight.tsx` | **Every token change flies from where it happened into the counter**, so the player sees exactly what they gain or spend (owner's call). A "+N" or "−N" chip pops out at the origin, holds for a moment and arcs up into the counter's coin. The flights are drawn by `TokenFlightProvider` (root layout), above every screen. An origin uses `useTokenOrigin()`: put its `ref` (and `collapsable={false}`, so iOS/Android keep the view measurable) on the view and call `send(+1 \| -1)`. **A spend awaits `send` before dispatching**, because the view can disappear right after (the Unlock button does). **A gain sends when its badge appears**: the result's "+N tokens" badge, about 700 ms after the reducer paid. The counter holds the change until then. An origin with no change to carry expires after 800 ms, so a result restored on launch doesn't fly. Any new way to earn or spend tokens (e.g. the Characters shop) only needs an origin. |
| `motion.ts` | `popFrom(value, from)`: the shared pop spring (tiles, hint word, token pill). Use it for any new pop so they all feel the same. |
| `GameScene.tsx` | Scene card: sky, sun, the balloon scene seen through its camera ([characters-and-animation.md](characters-and-animation.md)), and the `Stamp`. |
| `RoundParts.tsx` | `MissesBar` (one pip per allowed miss, so 6 pips at level 8), `WordTiles`, `HintPill`, `LetterShopPill`, `DescriptionCard`, `BigButton`. `PayButton` (private) is the coral "label + coin" button that spends tokens: the description's Unlock and the shop's "10". It sends the token flight, then pays, and turns beige and refuses ("Not enough tokens yet", `useRefusal`) without enough tokens. Reuse it for any new spend. |
| `LetterKeyboard.tsx` | Letters only, in the **iPhone (QWERTY) order**: 3 centred rows of 10/9/7, so players find letters where their thumbs expect them. Used keys **stay in place** and change look: mint = correct, grey with the letter faded (sunk, no shadow) = wrong, butter = clue, **empty dashed slot = disabled** by an easy level (not in the mockup; the slot keeps the QWERTY layout from shifting, and screen readers hear "not in this word"). Wrong keys show their letter, not a ✕ (owner's call), so the player can see at a glance what they already tried. Used keys and finished rounds can't be pressed. |
| `TabBar.tsx` | The 4 tabs. Play and Leaderboard navigate; Versus and Characters are drawn but disabled ("Coming soon" for screen readers). **Never a 5th tab.** How the tabs work: [leaderboard.md](leaderboard.md). |
| `Raised.tsx` | The mockup's flat bottom shadow (`box-shadow: 0 4px 0 color`) as a coloured block under the element. `pressed` sinks it, like a key going down. Use it for anything "raised"; native RN shadows blur and look wrong here. |
| `icons.tsx` | The mockup's SVG icons, copied verbatim as strings. |
| `PaperBackground.tsx` | Cream paper with the 18 px dot grid. |

## Sizing

- Tiles: the word is **always one row, never wrapped** (owner's call: a split word
  reads as two words). Tile width = what fits, capped at the mockup's 50; the gap
  shrinks too (8 → 6 over 6 letters → 3 over 10). A 15-letter word is about 20 pt
  tiles on a 375 pt phone. Font and the clue sparkle scale with the tile width.
- Keys: 10 fit across the widest row, so width = what fits (max 44, about 30 on a phone). Taller than wide like iOS keys: height = 1.45 × width (max 48), radius 30% of width.
- **Compact mode** (`height < 760`, e.g. iPhone SE 375×667): keys 1.35 × width (max 42) tall,
  tiles 48 tall, tab bar 60, smaller scene minimum. The scene is the flexible part
  (`flexGrow` between a minimum and the mockup's height), so every layout fits
  without scrolling. Checked at 393×852 and 375×667.
- Result scene max height is **340**, taller than the mockup's 282. The mockup also
  has a "Change character" button there, which is left out until the Characters
  page exists.

## Hint pill (not in the mockup)

The free hint words (CLAUDE.md, Hint words). A white pill, 40 tall (36 compact), with a
**sky blue** "HINT" chip and button. Sky means *free*, unlike coral (costs/actions),
butter (tokens, clue letters) and mint (correct). Hidden it reads "Tap to show a free
hint word" with an eye button. **The hint is not rendered until tapped.** Then it shows
the word, `1 / 3` and a next arrow, and every tap anywhere on the pill loops to the next
hint with a small pop. The index is component state, reset by a per-round `key`
(`hint-<round.id>`; not `round.id`, which the scene already uses as a sibling key). It
isn't saved, so a restart hides it again, which costs nothing. It's left off the result
screen. A round with no hints renders nothing. Checked at 393×852 and 375×667: still
no scrolling, the scene absorbs the height.

## Letter shop pill (not in the mockup)

Only on a level with `sellsLetters` ([progression-and-tokens.md](progression-and-tokens.md)). Same
white pill as the hint, under it, with a **butter** "LETTERS" chip (butter = clue letters and
tokens). It reads "Reveal 2 hidden letters" with a small coral **10** pay button. After buying it reads
"2 letters revealed", and the bought tiles and keys turn butter like clues. **The pill stays for the
whole round**, even when there's nothing left to buy or the round ends, so the scene never jumps; only
the button comes and goes. Checked at 393×852 and 375×667 with a 12-letter word: still no scrolling.

## Deliberate differences from the mockup

- **Description length**: descriptions are dictionary definitions of up to 140 characters
  ([word-database.md](word-database.md)), so the unlocked card shows **4 lines** (the mockup's are one
  short sentence), with `adjustsFontSizeToFit` (iOS) as a safety net. Checked at 393×852 and 375×667
  on level 8 (letter shop pill showing) with a 139-character description: no scrolling.
- **Blurred description**: the locked card shows a *placeholder* sentence drawn as
  blurred text (transparent text + text shadow), **never the real hint**. That way
  it can't be read from a screenshot or with accessibility tools.
- **Stamp ink**: the mockup roughens the stamp with an `feTurbulence` filter, which
  react-native-svg can't draw. The app knocks out a fixed set of specks with a mask instead.
- **Not enough tokens**: the Unlock button turns beige. Pressing it shows "Not enough
  tokens yet" in the card for 2 s. It never goes negative.
- No sound yet: [src/feedback.ts](../src/feedback.ts) is the single hook for game
  events (won, lost, stamp, unlock). Haptics only for now; add sound effects and music
  there. **Key presses don't buzz**: the owner found a vibration on every letter
  annoying. A correct/wrong key *sound* can come back with the sound effects.

## UI text

Every string is in [src/i18n/en.json](../src/i18n/en.json), read with `t(key, params)`
([src/i18n/index.ts](../src/i18n/index.ts)). Never hard-code UI text in a component.
Accessibility labels are translated too. A new language = a new JSON file with
the same keys, registered in `TRANSLATIONS`.
