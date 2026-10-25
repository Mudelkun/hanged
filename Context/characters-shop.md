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
- **Owned** = price 0, or in `unlockedCharacterIds` (bought), or every shop character for a developer account
  (`allCharacters`, never written to the save: [dev-accounts.md](dev-accounts.md)). Affordability is `canAfford`
  (a developer spends for free). Free characters are never stored, so making
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

## Prices and steady unlock pace (owner, 2026-10-22)

The owner chose a steady pace after descriptions became free: the first paid character in
about **20-30 rounds**, and the full collection in **1,500-2,000 rounds for a regular player**.
Mochi, Bun and Coco are free. **Coco became free on 2026-10-22** (owner's call) so onboarding can offer
Coco and Bun as the two starters (design: `design/onboarding/onboarding.html`); Biscuit took Coco's old
50 so the first paid character still lands at about round 21. The paid collection totals **5,825 tokens**
(previously 2,430).
Prices are still tuning values; observed play should guide future adjustments.

| Character | Previous tokens | Current tokens |
|---|---:|---:|
| Mochi | 0 | 0 |
| Bun | 0 | 0 |
| Coco | 30 | 0 |
| Biscuit | 50 | 50 |
| Pip | 75 | 150 |
| Bao | 100 | 200 |
| Koa | 125 | 250 |
| Lolo | 150 | 300 |
| Rocco | 175 | 375 |
| Ember | 200 | 450 |
| Sage | 225 | 550 |
| Rexy | 250 | 650 |
| Vesper | 300 | 800 |
| Button | 350 | 950 |
| Ribbit | 400 | 1,100 |

Early prices rise less to keep the first unlock accessible. Later prices account for the higher
rewards on the current 20-level ladder. The original prices were calibrated against an older
eight-level game with lower assumed win rates and paid descriptions. Applying a flat percentage
for the removed description charge alone would miss those changes.

**Letter reveals cost 15 tokens** for two letters (previously 10), once per round from level 8,
with at least one distinct letter left hidden. That is three base wins at the top levels;
a streak can earn it sooner. Descriptions stay free. Rewards, starting tokens and level rules
are unchanged. Existing balances and unlocked characters are preserved: prices only affect
future purchases, and `unlockedCharacterIds` still determines paid ownership.

### Repeatable economy check

Run **`npm run check:economy`** ([scripts/check-economy.js](../scripts/check-economy.js)). It uses
the existing TypeScript compiler to load the real `tokenReward`, `afterRound`, level table and
price constants. No separate copy of the reward or progression formulas, and no new dependency.
It models 400 seeded players per scenario, buying the cheapest remaining character as soon as
they can afford it. Prices are compared with the previous shop under identical win outcomes.

This is an **outcome model, not measured player data**. Assumed win probabilities, including
whatever help the player gets from the free description:

| Profile | Levels 1 / 2 | Levels 3-15 | Levels 16 / 17 / 18 / 19 / 20 |
|---|---|---|---|
| Casual | 90% / 85% | 75% | 70% / 68% / 65% / 62% / 60% |
| Regular | 95% / 90% | 82% | 80% / 78% / 75% / 72% / 70% |
| Strong | 98% / 95% | 90% | 88% / 86% / 84% / 82% / 80% |

A planned letter purchase happens on 0%, 5% or 10% of rounds on levels selling letters, only
when affordable. The model assumes enough hidden letters remain; actual eligibility can reduce
spending. It does not separately increase win probability after a purchase. These scenarios show
sensitivity to spending, rather than predicting how much letter reveals help.

Median collection-completion rounds with the new prices:

| Profile | First paid character | No letter purchases | 5% letter use | 10% letter use |
|---|---:|---:|---:|---:|
| Casual | 25 | 1,701 | 2,134 | 2,900 |
| Regular | 21 | 1,437 | 1,741 | 2,212 |
| Strong | 16 | 1,188 | 1,381 | 1,664 |

The regular 5% scenario is the calibration target; its previous prices gave the first character
at round 11 and the collection at round 668. The check exits with an error when the current
regular scenario leaves the owner's 20-30 / 1,500-2,000 target ranges. A frequent letter buyer
will collect more slowly; a stronger player or someone saving every token will collect faster.
The script also prints each character's cumulative unlock round. Re-run it when prices,
rewards or progression change, and validate these assumptions against real player data.

## The page (mockup: Characters)

Header (`TitleHeader live`: the spend flies into its pill) · showcase stage · name line · grid · action
button · tab bar.

- **Showcase**: the looked-at character in its **persona's signature pose** (`signatureXml`,
  [characters-and-animation.md](characters-and-animation.md)), drawn once and breathing with a slow
  native bob. Not the `cheer` pose: the owner found everyone cheering with arms up too childish. Above
  its head, a speech bubble with its **quote** (`quote.<id>`, one line); the figure shrinks by
  `BUBBLE_ROOM` so the bubble never covers ears or caps, and the bubble fades out under the purchase
  ribbon. Behind it, a radial glow, a sunburst that turns slowly and a rug. Arrows go through `SHOP` in
  a loop. The rays and the bob run **only while the page is in view** (`useIsFocused`). A new character
  pops in and its bubble pops with it.
- **Name line**: name, then "Fox · locked" / "· yours" / "· playing", and a butter price tag on a locked
  one. A refused purchase swaps the second line for "N more tokens to go" in coral for 2.2 s.
- **Grid**: **2 rows that scroll sideways** (`CharacterGrid`), filled column by column in price order.
  5.4 cards fit across, so a slice of the next one hints at more; the scroller bleeds to the screen
  edges. Three rows of 15 don't fit any phone without the page scrolling. The row scrolls itself to keep
  the looked-at card in sight when the stage's arrows move past the edge, and opens on it. Cards show the
  signature pose too. Tint per character, a lock and faded figure when locked, price or
  "Owned"/"Playing", a mint check on the one being played, coral border on the one being looked at.
  Cards are memoized, so looking at another one redraws two cards.
- **Action**: locked → `PayButton big` "Unlock Ember · 450" (beige and refused without enough tokens);
  owned → "Choose Ember"; playing → ghost "Play with Ember" (goes to Play).
- **Buying** sends the −N token flight from the button, then pays: confetti from the stage's bottom
  corners, the character pops, a "Ember is yours!" ribbon, success haptic. Picking pops it and ticks.
- The page opens on the character being played and remembers what was looked at while it stays mounted.
- **Compact phones**: cards 96 tall (116 normally), the stage is the flexible part (130 to 300 tall).
  Checked at 393×852 and 375×667 without scrolling.
- The round result has the mockup's ghost **"Change character"** button under "Next word"; it opens this page.

## Every place the character shows

All read `state.characterId`, so a pick shows everywhere at once: the Play scene, the result scene, the
headers' avatars (Play, Leaderboard, Characters), the Profile page's face (it and its "Change character" open
this page), the delete-account sheet, the streak takeover, the level path, and the player's
own leaderboard row (the local character, newer than the server's copy). Species names are UI text
(`species.<id>` in `en.json`, falling back to the rig's English one).
