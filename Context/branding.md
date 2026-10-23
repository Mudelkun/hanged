# Branding: icon, wordmark, loading screen

Reference: [design/branding.html](../design/branding.html) (+ `branding.png`, headless Chrome at 1900 wide,
`?t=2.25` freezes its live phone). It shows the icon and the explorations, the wordmark, and the loading
screen as a live phone, a storyboard and a timeline.

## The app icon

The owner's art, adopted as is (2026-10-23): a paw coming up from the bottom left, gripping the strings
of five big glossy balloons (`design/brand/icon-art.png`, 1254 px). The art has its own rounded frame and
a white margin, and iOS rounds the corners itself, so `design/brand/export.html?asset=icon` crops it to
the square inside the margin and fills the art's rounded corners with the same art zoomed and blurred:
never white, since a white corner could show at the edge of iOS's mask.

- `assets/icon.png` (1024, opaque), `assets/android-icon-foreground.png` (the same picture: Android's
  adaptive mask crops it; `adaptiveIcon.backgroundColor` is the sky), `assets/favicon.png` (48).
- Versions 1 (the buddy going "whoa!" as a balloon pops) and the vector Version 2 stay on the design page
  as explorations. Version 1 is why the rig has the `whoa` face and the `turn` option.

## The wordmark

`design/brand/brand.js` (`HangedBrand`): Play's letter tiles (mint and butter, with the characters' outline),
each hanging from one of the game's balloons (balloons.js), over a "WORD GUESSING GAME" pill. Like rig.js,
it returns SVG strings, and the app draws it through `src/brand/brand.ts`: **edit the brand there, never
a copy.** It needs rig.js and balloons.js loaded first.

- `wordmark(opts)`: `balloons: false` is the compact one (tiles and pill: `BOX_COMPACT`), used by the
  onboarding language page and the buddy picker (`src/components/Wordmark.tsx`). With balloons: `BOX`.
- The word and tagline are UI text: `brand.word` and `brand.tagline` in `src/i18n/*.json` (the word stays
  HANGED in every language; the tagline is translated). The per-letter looks repeat past six letters, so a
  new app name means new letters, not a new logo.
- Fonts: SVG text can't pick a weight by number on a phone, so the app passes its loaded font names
  (`BRAND_FONTS`: `Fredoka_700Bold`, `Fredoka_600SemiBold`); the browser default is family + weight.

## The native splash and the loading screen

- **Native splash** (app.json, `expo-splash-screen`): background `#dff1ff` (`SPLASH.bg`) and
  `assets/splash-icon.png`, the blank wordmark (six dashed tiles under their balloons, no pill) exported by
  `design/brand/export.html?asset=splash` at 3 × 336 points. `imageWidth: 336` is `BOX` width × `SPLASH.scale`.
  Change either and the first animated frame no longer matches: re-export, and keep them equal.
- **Loading screen** (`src/components/LaunchScreen.tsx`): the root `Gate` mounts the app once the fonts and
  the save are ready, with the loading screen over it, **once per launch** (state in `Gate`: coming back
  from the background never replays it). Its first frame is the native splash, so it hides the native
  splash on its first layout. Then, from `SPLASH` in brand.js (about 3 s): each letter swells like a
  balloon and springs into its letter, the tiles hop and the pill pops in, the word rises, the player's
  buddy floats up under its balloons (the game's own balloon scene), and lift-off carries everything up
  while the screen fades into the app. The game never waits on it: the app is already mounted and ready.
- A new player (onboarding not done) has no buddy yet: the word plays alone, then fades into onboarding,
  which opens with the same wordmark.
- A tap skips to the lift-off. Reduce Motion (`AccessibilityInfo`): the word shows at once, then a fade.
- Frames are rebuilt about 30 times a second (like the Play scene), keyed by `structureKey` so a changed
  SVG structure remounts. The clock reads `performance.now()` itself: a frame callback's timestamp isn't on
  that clock everywhere (Jest's isn't).
- Feel: Play's `tile` sound as each letter turns, `level-rise` on lift-off, and **one** haptic tap
  (`feedback.launch`) when the word is solved: no buzz per letter (the owner finds per-letter vibration
  annoying). Cues a tap skipped over stay quiet. Sound follows the effects switch like everything else.

## Regenerating the assets

From `design/brand/`, with headless Chrome (paths absolute, as in `dev-setup.md`):

```
chrome --headless=new --hide-scrollbars --window-size=1024,1024 --screenshot=<repo>/assets/icon.png "file:///<repo>/design/brand/export.html?asset=icon"
chrome --headless=new --hide-scrollbars --window-size=48,48 --screenshot=<repo>/assets/favicon.png "file:///<repo>/design/brand/export.html?asset=icon"
chrome --headless=new --hide-scrollbars --default-background-color=00000000 --window-size=1008,600 --screenshot=<repo>/assets/splash-icon.png "file:///<repo>/design/brand/export.html?asset=splash"
```

Copy `icon.png` to `android-icon-foreground.png`. The native splash and the icon only change in a new
native build (they're baked into the app binary), not over the air.

Tests: `src/components/__tests__/LaunchScreen.test.tsx` (the cues and the hand-over, the native splash
hiding on the first frame, tap to skip, Reduce Motion). Checked on web at 393 × 852; the native splash
hand-over and the buddy's frames still need a look on an iPhone.
