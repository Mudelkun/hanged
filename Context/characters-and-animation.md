# Characters and the hanging animation in the app

## One source for the characters: the design scripts

The app does **not** have its own copy of the characters. [src/characters/rig.ts](../src/characters/rig.ts)
imports [design/characters/rig.js](../design/characters/rig.js) and
[design/characters/hanging.js](../design/characters/hanging.js) directly. Those are
the same files the mockup and the preview pages use. They attach `HangedRig` /
`HangedAnim` to the global object and return **SVG strings**, which
react-native-svg's `<SvgXml>` draws.

- Change a character, a pose or a stage in `design/characters/*.js` and the mockup
  and the app both change. **Don't fork the rig into `src/`**, and don't convert it
  to JSX by hand: the two would drift apart.
- Keep those files **dependency-free plain scripts**, working in a browser
  `<script>` tag, in Metro, and in Node. Metro bundles them because they sit inside the
  project root.
- Import order matters: `hanging.js` reads `HangedRig` as it loads, so `rig.js`
  must be imported first.
- `rig.ts` holds the TypeScript types for the parts of the API the app uses. If you
  use something new from the scripts, type it there.
- The scripts put `class="hanged-scene"` on the root `<svg>`. React DOM rejects
  `class` on web, so `HangingScene` strips it (`sceneXml`).

## The animation loop

[src/components/HangingScene.tsx](../src/components/HangingScene.tsx), `AnimatedCharacter`:

- A `requestAnimationFrame` loop rebuilds the scene string ~30 times a second
  (`FRAME_MS` = 33) from `HangedAnim.frame(from, to, p, t)`. A frame is about 7 KB
  and takes well under a millisecond to build. `SvgXml` parses each new string.
- When the `stage` prop changes, the tween runs from the previous target stage
  to the new one over `STAGES[to].dur ?? DURATION`. Stage 10 has its own 1200 ms
  "drop" ease, the rope bounce. The per-stage loops (wave, shiver, wobble, sway…)
  keep running on top.
- **A new round remounts the scene** (`key={round.id}`), so it snaps to stage 0
  instead of tweening backwards from 10.
- **Won** has no keyframe in hanging.js. `wonFrame(t)` takes the stage-0 spot,
  applies the rig's `cheer` pose and `joy` face, waves the arms and adds a hop.
  It's built from the shared rig, so it works for every character.
- Lost uses stage 10 and a grey "sad" sky.

## Cropping

The scene is 480×470. The Play screen uses the mockup's crop `PLAY_VIEWBOX`
(`-150 18 780 432`), and the result screens use `RESULT_VIEWBOX` (`-60 18 600 432`),
both anchored `xMidYMax`. The fit is chosen from the box's shape:
**`slice` when the box is narrower than the crop, `meet` when it's wider**. Short
phones (the iPhone SE play scene is ~115 pt tall) then fit the height instead of
cutting off the beam and the character's head. The scripts draw grass 400 units
past each side, so `meet` never shows an empty edge.

## Avatars

`faceXml(character)` crops the head (`viewBox="30 4 140 140"`, same as the
mockup's `faceSvg`). It's used as the avatar until the player uploads a photo
(Profile page, not built). `characterTint` in [src/theme](../src/theme/index.ts)
gives each character its pastel circle colour.

## Character selection

`GameState.characterId` (default `mochi`) picks the hanged character. There is no
Characters page or price list yet: the token prices are open questions.
`characterById` falls back to Mochi for an unknown id.
