# Screen sizes: phones, tablets, and the screenshots

Every screen fits every device from a 320×568 phone to a 13" iPad, without overlapping, cutting off or
scrolling the game (owner's request, 2026-10-25: "look intentionally designed for every screen size").
One module decides how: [src/theme/layout.ts](../src/theme/layout.ts). Never size from
`useWindowDimensions()` or a `height < N` check in a screen: read `useLayout()`.

## The layout (`useLayout()`)

| Field | What | Who |
|---|---|---|
| `room` | The usable height: the window minus the safe area's top and bottom | the tiers below |
| `compact` | `room < 740`: iPhone SE (647), iPhone mini (728), Surface Duo (696) | smaller scene, keys, tab bar |
| `tight` | `room < 600`: the 320×568 class (548) | on top of compact: shorter header (52) and tab bar (54), keys down to 30, tiles 42 tall, clue at 13 pt, buttons 50 |
| `narrow` | width < 360 (320, Fold cover 344) | gutter 12, avatar 40, tighter level and token pills, tab labels 10.5, leaderboard rows |
| `tablet` | shortest side ≥ 600 | the column below; the tiers are off |
| `column` | The content's width: the whole width on a phone; on a tablet 56% of the height (a big phone's shape), 520–760, at least 32 from each edge | every screen |
| `gutter` | Side padding inside the column: 16 (12 narrow, 20 tablet) | |
| `available` | `column − 2 × gutter`: the room for tiles, keys, cards | |
| `scale` | The game pieces' size: 1 on a phone, `column / 393` on a tablet (≤ 1.6) | scene minimum, tiles, keys, pips, level card, streak meter |
| `type` | Text on the game board and the chrome: `1 + (scale − 1) / 2` | header, tab bar, clue, result lines |

`compact` used to be `window height < 760`, which ignored the notch: an iPhone mini (812 tall) got the roomy
layout with less usable room than it. The tiers now come from `room`.

**Why text grows less than the pieces on a tablet:** iPad points are already physically bigger than an
iPhone's, and Apple's type sizes are the same on both. The board (scene, tiles, keys) grows like Wordle's
on iPad; text grows half as much, so the clue stays proportionate next to big tiles without looking zoomed.

## How a screen uses it

- **`Column`** ([src/components/Column.tsx](../src/components/Column.tsx)): wrap everything but the full-bleed
  parts (the paper, a sky) in it, so a tablet shows the app centred with the paper running on at the sides.
  The header, body and `TabBar` go inside; overlays that dim the whole screen (`LevelChange`, sheets) stay outside.
- **Scrolling pages** (Profile, info pages, Friends): the header in `<Column fill={false}>`, and the
  `ScrollView` full-width with its content `{ width: column, alignSelf: 'center', paddingHorizontal: gutter }`,
  so the sides scroll too.
- **Bottom sheets** (`Sheet`, the onboarding legal sheet) are the column's width. Centred cards (Delete account,
  the Versus sheets) already cap their own width.
- **Full-bleed on purpose:** the loading screen, the level map's world (its footer card keeps to the column),
  the onboarding sky (the wordmark and buddies are placed in a column-wide stage inside it).
- **Scenes grow:** `useSceneRange(min, max)` ([GameScene.tsx](../src/components/GameScene.tsx)) for every scene
  that takes the room the rest leaves (Play, the result, Versus). On a phone: from `min` (×0.74 compact, ×0.5
  tight) to `max` plus the room a tall phone has past 760, so a Pro Max's spare height goes to the sky, not to a
  gap over the keyboard. On a tablet: no maximum (the column already has a phone's shape).
- **The stamp fits its scene:** `useStampWidth()` measures the scene and keeps the tilted stamp on screen and
  within 14 pt of the scene's top and bottom (it used to run off both edges of an iPhone SE and over the header).
- Pieces read the layout themselves (`LetterKeyboard`, `WordTiles`, `DescriptionCard`, `TabBar`, the headers,
  `BigButton`): don't pass sizes down. `useLayout` reads the safe area's context, so a piece rendered without a
  `SafeAreaProvider` (a test) still works; a test that mocks `react-native-safe-area-context` must also export
  `SafeAreaInsetsContext`.

## iPad

`app.json` sets `ios.supportsTablet: true` with `requireFullScreen: true` (the app is portrait only; without it
the App Store requires every orientation for Split View). A store submission then needs iPad screenshots too.

## Screenshots of every screen

`node scripts/screenshots.js` photographs every screen at 11 sizes (smallest phones to the 13" iPad) with their
safe areas, into `screenshots/<device>/<NN-screen>.png` plus `screenshots/index.html` (every device side by side
per screen). It drives headless Chrome over the DevTools protocol (`Emulation.setSafeAreaInsetsOverride` for the
notch and home indicator), seeds the save for each state, and plays a real Versus match against a second tab.

```bash
cd server && PORT=3010 npm run dev                       # the LOCAL server (never Railway: it creates players)
EXPO_PUBLIC_API_URL=http://localhost:3010 npx expo start --web --port 8090
node scripts/screenshots.js                               # all; or --devices ipad,se  --screens play,result
```

- It seeds the local board with 13 players, and reuses one player and one rival for every device (saved in
  `screenshots/.accounts.json`): the server allows 20 new players per address an hour.
- The server keeps a player in their queue or match across page loads, and the app then opens the room by itself:
  the script leaves any leftover before each device (`clearVersus`).
- Every load skips the loading screen (it's a button labelled with the app name); the onboarding run photographs it.
- It prints the page's errors and React warnings per scenario. Read them: that's how the empty-string crash below
  was found.
- `screenshots/` is gitignored: regenerate it after a layout change and look at `index.html`.

## Traps

- **A bare `''` in a View crashes iOS** ("Text strings must be rendered within a <Text> component"). The web only
  warns ("Unexpected text node: ."). `HangedWorld.farMountain()` returns `''` in a window too short for the
  mountain, which the level-up card's is on short phones: `{mountain && …}` rendered `''`. Guard strings with `!!`.
- **`collapsable={false}` reaches the DOM on web** and React warns on every render. Token origins spread
  `MEASURABLE` ([TokenFlight.tsx](../src/components/TokenFlight.tsx)) instead.
- `adjustsFontSizeToFit` does nothing on web, so the screenshots show labels at full size: the worst case.
