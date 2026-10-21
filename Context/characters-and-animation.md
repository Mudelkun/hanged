# Characters and the balloon animation in the app

The game used to hang the character. The owner changed the concept: the character
now floats under **10 balloons**, each wrong guess **pops one** and they sink, and at
stage 10 they **fall and land hard on the ground**: dazed, never hurt.
`design/characters/hanging.js` is still there because the mockup draws its old
hanging strip from it, but the app no longer imports it.

## One source for the characters: the design scripts

The app does **not** have its own copy of the characters. [src/characters/rig.ts](../src/characters/rig.ts)
imports [design/characters/rig.js](../design/characters/rig.js) and
[design/characters/balloons.js](../design/characters/balloons.js) directly. Those are
the same files the preview pages use (`balloons.html`, `balloons.png`). They attach
`HangedRig` / `BalloonAnim` to the global object and return **SVG strings**, which
react-native-svg's `<SvgXml>` draws.

- Change a character, a pose or a stage in `design/characters/*.js` and the previews
  and the app both change. **Don't fork the rig into `src/`**, and don't convert it
  to JSX by hand: the two would drift apart.
- Keep those files **dependency-free plain scripts**, working in a browser
  `<script>` tag, in Metro, and in Node. Metro bundles them because they sit inside the
  project root.
- Import order matters: `balloons.js` reads `HangedRig` as it loads, so `rig.js`
  must be imported first.
- `rig.ts` holds the TypeScript types for the parts of the API the app uses. If you
  use something new from the scripts, type it there.
- The scripts put `class="balloon-scene"` on the root `<svg>`. React DOM rejects
  `class` on web, so `GameScene` strips it.

## The stages

Stage N = N wrong guesses = N balloons popped (`POP_ORDER`: outer balloons first, the
last one sits on top). With fewer allowed misses the engine scales the count
(`sceneStage`, [game-engine.md](game-engine.md)), so the last miss always lands on 10.

- **Every forward step**: the balloon swells and shakes, pops (star burst, rays,
  falling scraps) during the first `POP` (16%) of the transition, then the
  character drops with a springy bounce. The drops grow as the lift runs out
  (`alt(n)`). The face goes happy → nervous → worried → scared, and the loops go
  wave → bob → swing → kick → flap → panic → cling.
- **Stage 10** passes through `beats` (keyframes inside one transition, 2200 ms):
  the last pop, a beat hanging in mid-air holding the empty string, the fall
  (accelerating), then the hit: a hard squash, a screen shake, one hop and a
  smaller second squash, dust clouds, flying clods, impact lines and cracks left in
  the ground. They end sitting with legs splayed, X-eyes and stars circling.
- Balloons and strings are drawn behind the character; the strings meet at the
  right paw (`pawAt(armR)`), which is also the pivot the body sways around.

## The animation loop

[src/components/GameScene.tsx](../src/components/GameScene.tsx), `AnimatedCharacter`:

- A `requestAnimationFrame` loop rebuilds the scene string ~30 times a second
  (`FRAME_MS` = 33) from `BalloonAnim.frame(from, to, p, t)`. SvgXml parses each
  new string.
- When the `stage` prop changes, the tween runs from the previous target stage
  to the new one over `STAGES[to].dur ?? DURATION` (900 ms; stage 10: 2200 ms).
  The Play screen's lost `RESULT_DELAY` (2600 ms) waits for the landing, so **if
  you change stage 10's duration, change that delay too**.
- **A new round remounts the scene** (`key={round.id}`), so it snaps to stage 0
  instead of tweening backwards from 10.
- **Won** has no keyframe in balloons.js. `wonFrame(stage, t)` keeps the round's
  stage (the balloons that are left), applies the rig's `cheer` pose and `joy`
  face to the free arm and the legs, keeps the right paw on the strings and adds a
  bounce. It's built from the shared rig, so it works for every character.
- Lost uses stage 10 and a grey "sad" sky.

## The camera (cropping)

The scene is 400×600, much taller than the scene card (at most 230 pt on Play,
340 on the result). Showing all of it would make the character tiny, so the app
looks through a **camera**: `CAMERA` is a window 1200 × 440 units (x from −400,
the grass and clouds run that far), and its top is `frame.cam`. `cam` follows the
character down at 60% of its sinking speed, computed from the keyframes only (so
the loops and the landing hop don't shake it). Stage 0 shows the bunch in the sky,
the ground comes into view at the end of stage 9, and the fall pans down onto it.

`GameScene` sets the SvgXml `viewBox` from the frame every tick and always **fits
the window's height** (`slice` when the box is narrower than the window, `meet`
when it is wider), anchored `xMidYMax`. No balloon or head is ever cut.

The app draws its own sky gradient and sun (native), so it calls
`scene(c, f, { sky: false })`; the scene's white clouds scroll with the camera and
sell the descent. Lost passes `clouds: false` and keeps the sky's grey native clouds.
The preview page uses the full 400×600 view with the scene's own sky.

## Avatars

`faceXml(character)` crops the head (`viewBox="30 4 140 140"`, same as the
mockup's `faceSvg`). It's used as the avatar until the player uploads a photo
(Profile page, not built). `characterTint` in [src/theme](../src/theme/index.ts)
gives each character its pastel circle colour.

## Character selection

`GameState.characterId` (default `mochi`) picks the character. There is no
Characters page or price list yet: the token prices are open questions.
`characterById` falls back to Mochi for an unknown id.
