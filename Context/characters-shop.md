# The Characters page: buying and picking characters

Route: [src/app/(tabs)/characters.tsx](../src/app/(tabs)/characters.tsx). Parts:
[src/components/CharacterShop.tsx](../src/components/CharacterShop.tsx). Rules:
[src/game/progress.ts](../src/game/progress.ts) (`buyCharacter`, `selectCharacter`, `ownsCharacter`,
`canBuyCharacter`, `characterPrice`). Prices: `CHARACTER_PRICES` in [src/game/config.ts](../src/game/config.ts).
How the characters are drawn: [characters-and-animation.md](characters-and-animation.md).

## Fully on the device (owner's call, 2026-10-22)

Buying and picking a character never touches the server and works offline. Ownership is part of the
game save (`unlockedCharacterIds`, `characterId`), like tokens. The server only receives the picked
`characterId` in the normal sync, so the leaderboard can draw the player's face. It never checks ownership.

## Rules

- **Prices** live in `CHARACTER_PRICES` (0 = free), cheapest first. That order is the page's order
  (`SHOP`). Every character in `design/characters/rig.js` needs a row; a test checks that, and that the
  prices never go down the list. A character without a row isn't sold or shown.
- **Owned** = price 0, or in `unlockedCharacterIds` (bought). Free characters are never stored, so making
  one free later gives it to everyone.
- **`buyCharacter`** pays the price, adds the character to `unlockedCharacterIds` and **plays with it at
  once** (the player bought it to use it). It's refused when the character is owned, unknown, or
  unaffordable. Like every spend, it never lowers the score.
- **`selectCharacter`** only picks an owned character.
- **The picked character is always owned.** `hydrate` makes sure of it: an id that left the shop goes back
  to `DEFAULT_CHARACTER`, and one that stopped being free (a price change) is kept, added to
  `unlockedCharacterIds`. A save from before the shop gets `[]` from `initialState()`. Same key, no bump.
- **A switch mid-round keeps the round.** The scene redraws the new character at the same stage
  (`GameScene` keeps its step; [characters-and-animation.md](characters-and-animation.md)).

## Prices (PLACEHOLDER) and why

Mochi and Bun are free (Mochi is the default). Then Coco 30, Biscuit 60, Bao 100, Lolo 150, Ember 200,
Rexy 250, Button 300, Ribbit 400 (the frog prince with the crown is the top prize). The mockup's prices
(10 to 50) were not used: the owner asked for prices that fit how tokens are really earned.

They come from simulating players through the real level and token rules (pay 1–4 per level, the
streak bonus, 10 wins to move up, drops after 3 losses, 15% of rounds buying a description):

| Player | Wins on level 1 → 8 | Tokens a round (net) |
|---|---|---|
| Casual | 80% → 35% | ~1.35 |
| Strong | 92% → 50% | ~2.1 |

So the first paid character comes in the first session (~25 rounds), each one after takes longer, and the
whole set takes a casual player ~1100 rounds (a strong one ~650). Saving for one favourite is at most
~300 rounds. **If the token pay (`LEVELS`, `STREAK_BONUS_AT`) or the description price changes, redo
this check** and adjust the prices with it.

## The page (mockup: Characters)

Header (`TitleHeader live`: the spend flies into its pill) · showcase stage · name line · grid · action
button · tab bar.

- **Showcase**: the looked-at character in the rig's `cheer` pose with the `joy` face, drawn once
  (`bodyXml`) and hopped with native transforms. Behind it, a radial glow, a sunburst that turns slowly
  and a rug. Arrows go through `SHOP` in a loop. The rays and the hop run **only while the page is in
  view** (`useIsFocused`). A new character pops in.
- **Name line**: name, then "Fox · locked" / "· yours" / "· playing", and a butter price tag on a locked
  one. A refused purchase swaps the second line for "N more tokens to go" in coral for 2.2 s.
- **Grid**: 5 columns, cards share the width (`CharacterGrid`). Tint per character, a lock and faded
  figure when locked, price or "Owned"/"Playing", a mint check on the one being played, coral border on
  the one being looked at. Cards are memoized, so looking at another one redraws two cards.
- **Action**: locked → `PayButton big` "Unlock Ember · 200" (beige and refused without enough tokens);
  owned → "Choose Ember"; playing → ghost "Play with Ember" (goes to Play).
- **Buying** sends the −N token flight from the button, then pays: confetti from the stage's bottom
  corners, the character pops, a "Ember is yours!" ribbon, success haptic. Picking pops it and ticks.
- The page opens on the character being played and remembers what was looked at while it stays mounted.
- **Compact phones**: cards 96 tall (116 normally), the stage is the flexible part (130 to 300 tall).
  Checked at 393×852 and 375×667 without scrolling.
- The round result has the mockup's ghost **"Change character"** button under "Next word"; it opens this page.

## Every place the character shows

All read `state.characterId`, so a pick shows everywhere at once: the Play scene, the result scene, the
headers' avatars (Play, Leaderboard, Characters), the streak takeover, the level path, and the player's
own leaderboard row (the local character, newer than the server's copy). Species names are UI text
(`species.<id>` in `en.json`, falling back to the rig's English one).
