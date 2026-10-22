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

## Personas: the characters' signature looks

Every character in `rig.js` has a `persona`: a signature pose, an attitude face, an optional lean and
props. The owner asked for this (2026-10-22): the old showcase had everyone cheering with arms up, which
read as "a kids' thing", so each character now has its own personality and a cooler stance. The persona
is used **only on the Characters page** (showcase and cards, via `signatureXml`). The game keeps its own
poses and faces (balloons, won `cheer`, streak takeover).

- `HangedRig.signature(c)` turns a persona into render options. Its quote is UI text (`quote.<id>` in
  `en.json`), not part of the rig.
- What the rig gained for personas, all **opt-in**:
  - **Elbows**: `elbowL` / `elbowR` angles split an arm into an upper arm and a forearm (crossed arms,
    fists on hips, raised fists). Arms are short: a paw can't reach the mouth or chin, so don't design
    poses that need it.
  - **`lean`**: tilts the whole figure around its feet.
  - **`layers`**: forces an arm `under` the body (hands behind the back), `back` (behind the head) or
    `front`, instead of the `ARM_FRONT_AT` rule.
  - **Props**: `under` (behind the body: Rocco's hidden tile), `held` (on the belly, under the arms: Bao's
    tea, Sage's book) and `over` (over the head: Biscuit's ball).
  - **Attitude faces** (`MOODS`): cool, smug, side, wink, fierce, calm, sleepy, blep.
- Skin options added with the 5 new characters (Pip, Sage, Rocco, Koa, Vesper): `beak`, `fang`, `eye`
  (pupil colour), `lash` (stroke colour for line-drawn eyes: Bao's are white so closed, joy and KO eyes
  show on its dark patches) and `decor.arm` (drawn with the arm: Vesper's wings).
- **The balloon frames don't change**: with no persona options, `render` returns the same string as before
  for every character (checked across every pose and expression; only Bao's joy/KO eyes changed, on
  purpose). Keep it that way: a persona feature must cost nothing when it's off.

## The stages

Two numbers drive the scene, both from the engine ([game-engine.md](game-engine.md)):

- **Pose stage** (`sceneStage`, 0..10): altitude, face, loops. With fewer allowed
  misses it's scaled (`round(wrong × 10 / maxWrong)`), so the last miss lands on 10.
- **Balloons gone** (`balloonsGone`, out of the 10 in `POP_ORDER`): a round starts
  with **one balloon per allowed miss** (level 8, 6 misses: 6 balloons) and **every
  miss pops exactly one**, so the balloons left always match the misses left. It
  goes to `frame()` as its `gone` pair. Don't derive the balloons from the pose stage:
  a scaled stage jumps by 2 and popped two balloons per miss (owner-reported bug).

`POP_ORDER` pops the outer balloons first; the last one sits on top.

- **Every forward step**: the balloon swells and shakes, pops (star burst, rays,
  falling scraps) during the first `POP` (16%) of the transition, then the
  character drops with a springy bounce. The drops grow as the lift runs out
  (`alt(n)`). The face goes happy → nervous → worried → scared, and the loops go
  wave → bob → swing → kick → flap → panic → cling.
- **Stage 10** passes through `beats` (keyframes inside one transition, 2200 ms),
  on **any** forward step into it (hard levels jump 8 → 10):
  the last pop, a beat hanging in mid-air holding the empty string, the fall
  (accelerating), then the hit: a hard squash, a screen shake, one hop and a
  smaller second squash, dust clouds, flying clods, impact lines and cracks left in
  the ground. They end sitting with legs splayed, X-eyes and stars circling.
- Balloons and strings are drawn behind the character; the strings meet at the
  right paw (`pawAt(armR)`), which is also the pivot the body sways around.

## The animation loop

[src/components/GameScene.tsx](../src/components/GameScene.tsx), `AnimatedCharacter`:

- A **`setInterval`** (`FRAME_MS` = 33) rebuilds the scene string ~30 times a second
  from `BalloonAnim.frame(...)`, and SvgXml parses each new string. Not
  `requestAnimationFrame`: on React Native (new architecture) it's a `setTimeout(0)`,
  so a rAF loop spins the JS thread non-stop and the phone stutters.
- **Keep frames light** (owner-reported lag on the phone): a frame is ~8–10 KB and
  ~80 elements, like the old hanging. balloons.js draws one path per cloud, skips
  clouds and ground the camera can't see, and `trim()` cuts every decimal to one
  place. Measure a frame (`scene(...).length`, count of `<`) before adding scenery.
- **iOS keeps stale attributes** (owner-reported: one balloon drawn far from the
  bunch on the phone, fine in the browser). SvgXml re-renders by element position;
  when an element is reused for something that lacks one of its attributes,
  react-native-svg on iOS keeps the old value. A pop's burst star is a `<path>`
  with a `transform`; once it went, the next balloon's body path took its slot and
  kept that transform. So `GameScene` keys the SvgXml by `structureKey(xml)`, a hash
  of the tags and attribute names (values stripped): the drawing remounts only
  when its structure changes (0 times while floating, 4–5 per pop, ~13 for the
  landing) and otherwise updates values in place. Keep loops from flipping
  structure every cycle: an arm swinging across the rig's `ARM_FRONT_AT` (100°)
  moves in front of the head, so the flap pose sits at 70°.
- **Check changes to the scene on a phone**, not only in the browser: react-native-web
  doesn't have this bug.
- When the `stage` or `gone` prop changes, the tween runs from the previous target stage
  to the new one over `STAGES[to].dur ?? DURATION` (900 ms; stage 10: 2200 ms).
  The Play screen's lost `RESULT_DELAY` (2600 ms) waits for the landing, so **if
  you change stage 10's duration, change that delay too**.
- **A new round remounts the scene** (`key={round.id}`), so it snaps to stage 0
  instead of tweening backwards from 10.
- **A new character does not remount it**: the step is kept, so a character picked mid-round
  carries on at the same stage. Until the loop draws its first frame, `AnimatedCharacter` draws it
  at rest on the stage (`restFrame`), so the old character never flashes when Play comes back.
- **The loop stops while another tab is in view** (`useIsFocused`). Frozen tabs (`freezeOnBlur`)
  skip renders but their timers still run, so without this the scene was built 30 times a second
  behind the Leaderboard and Characters pages.
- **Won** has no keyframe in balloons.js. `wonFrame(stage, gone, t)` keeps the round's
  stage (the balloons that are left), applies the rig's `cheer` pose and `joy`
  face to the free arm and the legs, keeps the right paw on the strings and adds a
  bounce. It's built from the shared rig, so it works for every character.
- Lost uses stage 10 and a grey "sad" sky.

## The camera (cropping)

The scene is 400×600, much taller than the scene card (at most 230 pt on Play,
340 on the result). Showing all of it would make the character tiny, so the app
looks through a **camera**: `scene(c, f, { camera: true })` uses a fixed viewBox
1200 × 440 units (`CAMERA`, x from −400: the grass and clouds run that far) and
moves the drawing up by `frame.cam`. `cam` follows the character down at 70% of its
sinking speed, starting 24 units above the scene top (room for the won bounce), and
is computed from the keyframes only (so the loops and the landing hop don't shake
it). Stage 0 shows the bunch in the sky, the ground comes into view near the end,
and the fall pans down onto it.

**The viewBox never changes**: the pan is a transform inside the drawing. (The owner saw balloons out
of frame on the phone while the SvgXml `viewBox` prop changed every frame; a fixed
viewBox rules that out on every platform.)
`GameScene` always **fits the window's height** (`slice` when the box is narrower
than the window, `meet` when it is wider), anchored `xMidYMax`, so no balloon or
head is cut.

The app draws its own sky gradient and sun (native), so it calls
`scene(c, f, { sky: false })`; the scene's white clouds scroll with the camera and
sell the descent. Lost passes `clouds: false` and keeps the sky's grey native clouds.
The preview page uses the full 400×600 view with the scene's own sky.

## Avatars

The avatar is the player's picture everywhere: there are no photo uploads for now (owner's call,
[profile.md](profile.md)). The owner asked that no two characters share the same profile look
(2026-10-22), so each avatar shows the character's personality:

- `HangedRig.avatar(c)` in `rig.js` draws the persona (signature face, head tilt, crossed arms, prop;
  its lean dropped so the head sits centred) on a **backdrop that fits it** (`AVATARS`: Bun's clouds,
  Pip's snow, Koa's dusk moon, Sage's bookshelf, Rocco's stolen letter tiles, Vesper's full moon…),
  clipped to a circle that fills the viewBox. `HangedRig.avatarRing(c)` is the character's ring colour.
- In the app, `avatarXml(c)` ([src/characters/rig.ts](../src/characters/rig.ts)) caches it per character
  (leaderboards draw the same few many times), and `Avatar` in
  [GameHeader.tsx](../src/components/GameHeader.tsx) is the **only** component that shows it: header
  button, leaderboard rows, level path and map markers, Profile. Its ring takes `avatarRing`.
- Backdrops draw **no `<text>`**: react-native-svg has no font to give it. Letters are stroked paths
  (`GLYPH`).
- Design sheet: [design/characters/avatars.html](../design/characters/avatars.html) (+ `avatars.png`),
  with each character's personality word and quote, at full and in-app sizes.

`faceXml(character, expr)` still crops the plain head (`viewBox="30 4 140 140"`, same as the mockup's
`faceSvg`) for a chosen face, e.g. the Profile page's worried one. `characterTint` in
[src/theme](../src/theme/index.ts) is each character's pastel card colour on the Characters page.

## Character selection

`GameState.characterId` (default `DEFAULT_CHARACTER`, Mochi) picks the character. The player buys and
picks characters on the Characters page: [characters-shop.md](characters-shop.md) (prices, ownership,
where the character shows). `characterById` falls back to Mochi for an unknown id.
