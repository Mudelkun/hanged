# The Play screen (and the round result)

Route: [src/app/(tabs)/index.tsx](../src/app/(tabs)/index.tsx). It follows the **Play** and
**Round lost** phones in [design/ui-mockup.png](../design/ui-mockup.png).
Sizes, radii and colours are copied from the CSS in
[design/ui-mockup.html](../design/ui-mockup.html), and the palette lives in
[src/theme](../src/theme/index.ts). When the mockup changes, diff its CSS against
these components.

## Two layouts on one screen

After new-player onboarding, the selected character descends into the scene and `WelcomeToast` shows
the Profile welcome wording for 2.4 seconds. It overlays the body without moving keys and does not replay
after a restart. This uses the normal first round and economy. See [onboarding.md](onboarding.md).

- **Playing**: header · scene · miss pips · word tiles · letter shop pill (levels that sell letters) · description card · keyboard · tab bar.
- **Result** (won or lost): header · bigger scene + rubber stamp ("DROPPED !!" red /
  "HANGING !!" green). The stamp sizes its font to fit the frame from Fredoka Bold's real letter
  widths (`FREDOKA_BOLD_EM`), because react-native-svg on iOS ignores `textLength`; text that would
  drop below 50 breaks onto two lines. Changing the stamp font means re-reading that table from the
  .ttf · "10 / 10 misses · the word was" · full word · description
  (always unlocked) · **Next word** · **Change character** · tab bar. A round that moved the level adds a line under the
  misses line, in the new level's colour: "Level up! Welcome to level N." or "Back to level N. You've
  got this!" (encouraging, never a penalty message). The round that counted the day adds "N days in a row! See you
  tomorrow." in flame orange ([retention.md](retention.md)).
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
it shows, so the stamp and the token flight come first. The card holds the **level path** (`LevelPath.tsx`, shared with the level map below): a winding
road of numbered stops, level 1 at the bottom, drawn in react-native-svg. Only stops up to
`bestLevel` are drawn; past them is the fog (see The level map). Reached stops are glossy buttons
raised in their colour; stops ahead are pale and dashed. The player's **character avatar** stands
on its stop and travels to the new one: it hops up (a trail in the new level's colour fills along the dirt
road, the stop pops, sparkles burst, success haptic) or slides down (the trail empties, the old stop turns
pale again, a light tap). The window's "camera" follows the character, so any number of levels fits any phone; the window is
a slice of the level world (see The level map). **The card has no button** (owner's call): `HOLD_MS` (1.3 s) after the
character lands, it fades out by itself (`onClose` → `levelGone`), leaving the result, and the player
taps **Next word** as after any round. It blocks taps on the result while it's up.

- **The header waits for it**: until the character lands, the header keeps the round's level, then
  `Lv N` changes colour and pops (`onLanded`), the same idea as tokens waiting for their flight.
- **It plays once**: not for a round restored already finished (`restoredId`), and not again once it
  has closed (`levelGone`, by `round.id`). "Next word" before the card appears skips it.
  `onLanded`/`onClose` must stay stable (`useCallback`): the closing timer's effect depends on them.
- **The card has `zIndex: 10`.** On iOS, `zIndex` becomes a native layer depth that ignores the
  parent's stacking order, so the stamp's `zIndex: 2` drew over the card on a phone even though the
  card comes later in the tree. Anything drawn over the result needs a zIndex above 2.
- Positions come from `pathLayout()` (LevelPath) plus the trip in `geometry()`: each stretch is an S-curve leaving and entering stops straight
  up, and the character and camera follow 8 samples of it. The road's fill is an SVG dash offset,
  which can't use the native driver, so it runs as its own JS-driven value in step with the travel.
- **Reaching the top level** (`geo.top`): the title is "You reached the top!", and the camera drifts up as
  the character climbs (`TOP_LIFT`, a share of the window), so it ends with the stop low in the window and the
  castle above it. The layout's room over the last stop is exactly what the window shows there (`edge + lift +
  MARKER_LIFT / 2`), so no empty strip shows at the top. The fog covers the castle during the climb (drawn even
  though nothing lies past the top level), then lifts on landing (`fx.fog`), two `Confetti` poppers fire from
  the window's bottom corners, and a crown pops onto the character. It lingers `HOLD_TOP_MS` (2.6 s), not 1.3 s.
- The card draws its world while it waits to appear (`WARM_MS`), so it opens without a stutter (parsed bands
  are kept, see The level map).
- Checked on web at 393×852 and 375×667 (both directions, and 19 → 20); the card fits without scrolling.

## The level map: tap the level (owner's idea, not in the mockup)

Tapping the header's `Lv N` pill opens `LevelMap`, a full-screen sheet over the Play screen (tab bar
included, `zIndex: 20`). The owner asked for it to feel like a place to climb (from a reference picture
of a game map, then a second one with terraces and a castle), so the path climbs **a world**:
- every stop sits on its own **terrace**, a grassy plateau over a tall rock cliff, joined to the next by a
  grassy ramp along the road, stepping up over a sea of clouds; far floating islands and clouds behind
- pine and round trees, wooden fences on the cliff side, lanterns, cottages, waterfalls spilling off the
  ramps, flowers and rocks; a meadow at the foot
- a **dirt road** with white dashes, and a **stone ring** under every stop (the colour is on the stops)
- the goal is a **castle with a crown**. Below the top level only its mountain shows, far away, poking out of
  the fog (it says there is a top, never how far). On the top level the fog is gone: the castle stands behind
  the last stop, in the sun (a glow and rays), the stop gets a gold ring and sparkles, and the character wears
  a crown (the header's `Lv N` pill shows a crown too). The card counts the words guessed up there
  (`progress.wins` keeps counting on the last level) and says what a word pays there
- decorations placed by a seeded `rand(n)`, so the world looks the same on every visit

**The world is drawn by [design/world/world.js](../design/world/world.js)**, a plain script like the
character rig, so the design preview ([design/level-top.html](../design/level-top.html)) and the app draw
the same thing. [src/world/world.ts](../src/world/world.ts) types it. Change the world there, never in a
copy. It returns SVG strings rendered through react-native-svg's parser, so it sticks to what that supports
on iOS: **no masks, no filters, no nested `<svg>`, no `paint-order`**. A cliff is its terrace's bottom
outline extruded down (one path with a vertical gradient), not a mask. `src/world/__tests__` draws every
level at every phone width and parses every band the way the phone does.

The world scrolls vertically, edge to edge, in a `ScrollView`, under a wooden **sign** ("Level path",
with leaves) and the ✕. It opens with the player's character standing on their stop, with a slow bob,
in the middle of the space between the sign and the bottom card. The card shows the level (a filled
pill), a bar of the words won on it, and the next step: "N more words to clear the fog", or "…to reach
level N" when the player dropped and the stop above is known.
- Left out of the reference on purpose: stars under the stops (the game has no star rating per level)
  and a settings gear (settings live on the Profile page).
- **The world is drawn in 512-pt bands** (one Svg each, `viewBox` on its slice), and the ScrollView
  has `removeClippedSubviews`. With 20 levels, a single Svg would be one bitmap about 2,400 pt tall.
  `art()` lists the world's pieces with the height range each covers, so **a band only gets the pieces it
  shows** (about 1,900 elements for all 20 levels; the old world drew every element in every band). Each
  band is **parsed once and kept** (`worldBands`, the last 6 layouts), so opening the map again is free.
  Parsing the top level takes tens of ms: keep an eye on it if the world grows. Same-coloured circles are
  merged into one path (`dots`) to keep the element count down. The level-up card animates only the
  stretch being filled, in its own small Svg on top.

- **The fog (owner's call): the player must never learn how many levels there are.** At level 6 they
  can't see level 7 or know it exists, only that the road runs into fog. So the path draws stops only
  up to `bestLevel`, and `PathFog` covers the rest: mist thickening over the sky, a thick bank of
  overlapping clouds where the road goes in, fainter puffs drifting above, and a dim dashed **"?"**
  stop where the next level would be, never its number. The castle's far mountain sits in the fog,
  between the mist and the clouds; its foot stays inside the cloud bank, because the fog is drawn over the
  stops (a mountain reaching lower washed out the last stop). Once the player has reached the top level
  (`bestLevel`), there's no fog at all: the map leaves `PathFog` out, even after a drop. The level-up
  card uses the same fog.
- Stops between the current level and `bestLevel` (after a drop) are pale and dashed, like a stop not
  yet reached on the level-up card.
- The pill is disabled while a level change is due (`levelChanging`), so the map never shows a level
  the header and the level-up card haven't shown yet.
- The bank's back rows are clouds **without** the flat shadow: overlapping shadows drew a hard
  horizontal line. Only the front row and the mist puffs keep it. Clouds are staggered up and down for
  the same reason.
- Each `PathWorld` and `PathFog` gets its own gradient `id` (web shares SVG ids across the page).
- The level-up card's window shows the same world, so a level-up happens in the same place as the map.
- Checked on web at 393×852 and 375×667 at levels 1, 8, 19 after a drop from 20, and 20 (scrolled down too),
  plus the level-up card 19 → 20.
- The design preview: [design/level-top.html](../design/level-top.html) (+ `level-top.png`, headless Chrome at
  2330×1720) shows the whole 20-level world, the map at levels 8 and 20, and the card reaching the top.

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
| `GameHeader.tsx` | Avatar button (opens Profile), **player name** (never the app name; a new player's is random, e.g. "SunnyOtter"; at most 15 characters, sized to fit the room beside the pills (27 down to 14), cut with "…" if it still doesn't fit), words guessed, `Lv N` in the level's colour (pops when it changes; tapping it opens the level map), token pill. The **daily streak** sits on the avatar's corner (flame + days, grey until today counts: [retention.md](retention.md)). |
| `LevelPath.tsx` | The shared level path: `pathLayout()` (stops up to the best level), `PathWorld` (the world, from [design/world/world.js](../design/world/world.js)), `LevelStop`, `PathFog`. Use it for any new view of the levels. The world's palette is in world.js; the fog and sign colours are `worldColors` in [src/theme](../src/theme/index.ts). |
| `LevelChange.tsx` | The level path card (see Level change above). |
| `LevelMap.tsx` | The full-screen level map (see The level map above). |
| `StreakTakeover.tsx` | The streak meter takeover (see Words in a row above). |
| `ReminderSheet.tsx` | "Keep your streak going?", asked once over the first won round's result, before the OS's notification prompt ([retention.md](retention.md)). |
| `Sheet.tsx` | The bottom sheet over a dimmed screen (`Sheet`, `sheetText`): the language picker's and the reminder's. Use it for any new sheet. |
| `Confetti.tsx` | A party-popper burst driven by one value, native driver only. `seed` and `aim` per popper. Reuse it for any big celebration. Pieces flutter with a flat `scaleY`, **never `rotateX`** (see the 3D trap in [dev-setup.md](dev-setup.md)). |
| `SparkBurst.tsx` | The sparkle ring thrown out as a value runs 0 → 1. Shared by the token pill's gain and a level-up; reuse it for any new celebration. |
| `TokenPill.tsx` | The header's token counter, live on Play and Characters (where tokens move). Its number only changes when a **token flight** lands, then counts one token at a time (about 700 ms in total, whatever the amount). **Gain**: the coin flips once per token, the pill pops and sparkles burst. **Spend**: the pill squishes and the coin wobbles. A change that no origin claims within 4 s is counted in place (a slow phone can take over a second to show the win badge). The balance it mounts with never animates; this is safe because Play only mounts after the save loads. **Several live pills**: flights land on the focused screen's pill (it sets the hub's target on focus), and a pill shows a change as is when its screen isn't focused or another pill already showed it (`claim` / `isClaimed`), so coming back to Play after buying a character doesn't count the spend again. |
| `TokenFlight.tsx` | **Every token change flies from where it happened into the counter**, so the player sees exactly what they gain or spend (owner's call). A "+N" or "−N" chip pops out at the origin, holds for a moment and arcs up into the counter's coin. The flights are drawn by `TokenFlightProvider` (root layout), above every screen. An origin uses `useTokenOrigin()`: put its `ref` (and `collapsable={false}`, so iOS/Android keep the view measurable) on the view and call `send(+1 \| -1)`. **A spend awaits `send` before dispatching**, because the view can disappear right after (the Unlock button does). **A gain sends when its badge appears**: the result's "+N tokens" badge, about 700 ms after the reducer paid. The counter holds the change until then. An origin with no change to carry expires after 800 ms, so a result restored on launch doesn't fly. Any new way to earn or spend tokens only needs an origin, and a live `TokenPill` in its screen's header (the Characters page: `TitleHeader live`). |
| `motion.ts` | `popFrom(value, from)`: the shared pop spring (tiles, token pill). Use it for any new pop so they all feel the same. |
| `GameScene.tsx` | Scene card: sky, sun, the balloon scene seen through its camera ([characters-and-animation.md](characters-and-animation.md)), and the `Stamp`. |
| `RoundParts.tsx` | `MissesBar` (one pip per allowed miss, so 6 pips at level 8), `WordTiles`, `LetterShopPill`, `DescriptionCard`, `BigButton` (`ghost`: white). |
| `PayButton.tsx` | `PayButton`, the coral "label + coin" button that spends tokens: the letter shop's price and the Characters page's Unlock (`big`: BigButton's size). It sends the token flight, then pays, and turns beige and refuses without enough tokens; `useRefusal` shows why ("Not enough tokens yet") for 2.2 s. Reuse it for any new spend. |
| `LetterKeyboard.tsx` | Letters only, in the **iPhone (QWERTY) order**: 3 centred rows of 10/9/7, so players find letters where their thumbs expect them. Used keys **stay in place** and change look: mint = correct, grey with the letter faded (sunk, no shadow) = wrong, butter = clue, **empty dashed slot = disabled** by an easy level (not in the mockup; the slot keeps the QWERTY layout from shifting, and screen readers hear "not in this word"). Wrong keys show their letter, not a ✕ (owner's call), so the player can see at a glance what they already tried. Used keys and finished rounds can't be pressed. |
| `TabBar.tsx` | The 4 tabs, all navigating (Versus: [versus.md](versus.md)). An entry without an `href` would be drawn disabled ("Coming soon" for screen readers). **Never a 5th tab.** How the tabs work: [leaderboard.md](leaderboard.md). |
| `Raised.tsx` | The mockup's flat bottom shadow (`box-shadow: 0 4px 0 color`) as a coloured block under the element. `pressed` sinks it, like a key going down. Use it for anything "raised"; native RN shadows blur and look wrong here. |
| `icons.tsx` | The mockup's SVG icons, copied verbatim as strings. |
| `PaperBackground.tsx` | Cream paper with the 18 px dot grid. |

## Sizing

- Tiles: the word is **always one row, never wrapped** (owner's call: a split word
  reads as two words). Tile width = what fits, capped at the mockup's 50; the gap
  shrinks too (8 → 6 over 6 letters → 3 over 10). A 15-letter word is about 20 pt
  tiles on a 375 pt phone. Font and the clue sparkle scale with the tile width.
- Keys: 10 fit across the widest row, so width = what fits (max 48, about 33-35 on a phone). The
  keyboard reaches 10 pt past the screen's side padding (like the iOS one) for wider keys. Taller
  than wide like iOS keys: height up to 1.6 × width (max 58), radius 30% of width.
- **The keyboard shrinks before anything overflows** (owner, 2026-10-22: bigger keys, but leave
  room for features to come). It asks for its full size as a flex basis, may shrink, and sizes its
  keys from the height it is given (`onLayout`), down to 38 pt (34 compact). The scene is the only
  part that grows, so anything new on the Play screen takes the scene's spare room first, then the
  keys'. Don't give the keyboard a fixed height or wrap it in a sized view.
- **Compact mode** (`height < 760`, e.g. iPhone SE 375×667): keys up to 1.45 × width (max 48) tall,
  tiles 48 tall, tab bar 60, smaller scene minimum. The scene is the flexible part
  (`flexGrow` between a minimum and the mockup's height), so every layout fits
  without scrolling. Checked at 393×852 and 375×667.
- Result scene max height is **340**, taller than the mockup's 282. Under "Next word" sits the
  mockup's ghost **"Change character"** button, which opens the Characters page
  ([characters-shop.md](characters-shop.md)). The scene absorbs its height: checked at 393×852 and
  375×667 without scrolling.

## Free description clue (owner, 2026-10-22)

Hint words are removed. The dictionary description is always visible in its card, from the start
of every round and on results, including restored rounds. There is no reveal button, hidden prompt,
payment or token flight. `DescriptionCard` takes only the text and compact-layout flag; it has no
visibility state. Rewards are unchanged; shop prices follow the steady pace in [characters-shop.md](characters-shop.md).

## Letter shop pill (not in the mockup)

Only on a level with `sellsLetters` ([progression-and-tokens.md](progression-and-tokens.md)). A
white pill between the word tiles and the description, with a **butter** "LETTERS" chip (butter = clue letters and
tokens). It reads "Reveal 2 hidden letters" with a small coral **15** pay button; the bought tiles and
keys turn butter like clues. **The pill only shows while the letters can be bought**
(`lettersForSale`): once bought, when only 2 letters are left hidden (buying must leave one hidden), or
when the round ends, it's removed and the scene grows into the space (owner's call, 2026-10-22: a dead
pill with no button was confusing). Without enough tokens it stays, and its button refuses. Checked at
393×852 and 375×667 with a 12-letter word: still no scrolling.

## Deliberate differences from the mockup

- **Description length**: descriptions are dictionary definitions of up to 140 characters
  ([word-database.md](word-database.md)), so the card shows **4 lines** (the mockup's are one
  short sentence), with `adjustsFontSizeToFit` (iOS) as a safety net. Checked at 393×852 and 375×667
  on level 8 (letter shop pill showing) with a 139-character description: no scrolling.
- **Stamp ink**: the mockup roughens the stamp with an `feTurbulence` filter, which
  react-native-svg can't draw. The app knocks out a fixed set of specks with a mask instead.
- **Not enough tokens**: paid letter and character buttons still refuse purchases
  without enough tokens. The free description has no affordability check.
- No sound yet: [src/feedback.ts](../src/feedback.ts) is the single hook for game
  events (won, lost, stamp, unlock). Haptics only for now; add sound effects and music
  there. **Key presses don't buzz**: the owner found a vibration on every letter
  annoying. A correct/wrong key *sound* can come back with the sound effects.

## UI text

Every string is in [src/i18n/en.json](../src/i18n/en.json), read with `t(key, params)`
([src/i18n/index.ts](../src/i18n/index.ts)). Never hard-code UI text in a component.
Accessibility labels are translated too. A new language = a new JSON file with
the same keys, registered in `TRANSLATIONS`.

**Layouts must fit every language** (fr, de and es run up to twice as long as en:
"rating" → "classement", "Owned" → "Freigeschaltet"). Size for the longest one, never English:
- A label in a fixed-width slot (tab, stat, chip, card) gets `numberOfLines={1} adjustsFontSizeToFit
  minimumFontScale={0.75–0.8}` and `minWidth: 0` on its flex parent, so it shrinks and is never cut off.
- Don't put a number and its label side by side in a narrow cell: stack the label under it
  (the Versus stats strip, the Profile stats).
- A label that can take two lines (buttons: `PillButton`, lobby mode chips, the character's
  quote bubble) gets `numberOfLines={2}` and is centred.
- When a translation is still too long once shrunk, shorten the translation (de `chars.card.owned`: "Deins").
- `adjustsFontSizeToFit` does nothing on web: the web preview shows the worst case, so check
  long languages there at 375 px wide.
