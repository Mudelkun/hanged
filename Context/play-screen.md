# The Play screen (and the round result)

Route: [src/app/index.tsx](../src/app/index.tsx). It follows the **Play** and
**Round lost** phones in [design/ui-mockup.png](../design/ui-mockup.png).
Sizes, radii and colours are copied from the CSS in
[design/ui-mockup.html](../design/ui-mockup.html), and the palette lives in
[src/theme](../src/theme/index.ts). When the mockup changes, diff its CSS against
these components.

## Two layouts on one screen

- **Playing**: header · scene · miss pips · word tiles · hint pill · description card · "Next token" bar · keyboard · tab bar.
- **Result** (won or lost): header · bigger scene + rubber stamp ("HANGED !!" red /
  "SAVED !!" green) · "10 / 10 misses · the word was" · full word · description
  (always unlocked) · token bar · **Next word** · tab bar.
- The "Next token" bar only shows while `WORDS_PER_TOKEN` > 1. At the current rate
  (1 token per word) it is hidden on both layouts, and the win line's "+1 token" badge
  carries the reward. This differs from the mockup, which still shows "1 / 2 words".

When a round ends, the play layout **stays for a moment** (`RESULT_DELAY`: lost
1400 ms so the fall plays, won 700 ms so the last tile pops). Then the result
appears and the stamp pops. Input is already locked during that delay because
the engine refuses guesses. The "which round is showing its result" check is
by `round.id`, so a round restored already finished opens straight on its result.

On a loss, tiles the player found turn **mint**, and letters they missed turn
**coral** (mockup). On a win, clue tiles stay butter and guessed ones are mint.

## Components ([src/components](../src/components))

| File | What |
|---|---|
| `GameHeader.tsx` | Avatar button (will open Profile; disabled now), **player name** (never the app name; default "Player" until Profile exists), words guessed, `Lv N`, token pill. |
| `HangingScene.tsx` | Scene card: sky, sun, drifting clouds, the animated character ([characters-and-animation.md](characters-and-animation.md)), and the `Stamp`. |
| `RoundParts.tsx` | `MissesBar` (one pip per allowed miss, so 6 pips at level 8), `WordTiles`, `HintPill`, `DescriptionCard`, `TokenBar`, `BigButton`. |
| `LetterKeyboard.tsx` | Letters only, in the **iPhone (QWERTY) order**: 3 centred rows of 10/9/7, so players find letters where their thumbs expect them. Used keys **stay in place** and change look: mint = correct, grey with the letter faded (sunk, no shadow) = wrong, butter = clue, **empty dashed slot = disabled** by an easy level (not in the mockup; the slot keeps the QWERTY layout from shifting, and screen readers hear "not in this word"). Wrong keys show their letter, not a ✕ (owner's call), so the player can see at a glance what they already tried. Used keys and finished rounds can't be pressed. |
| `TabBar.tsx` | The 4 tabs. Only Play exists; the others are drawn but disabled ("Coming soon" for screen readers). **Never a 5th tab.** |
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

## Deliberate differences from the mockup

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
