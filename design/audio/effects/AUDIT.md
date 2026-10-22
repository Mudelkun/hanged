# Sound interaction audit

Reviewed the current Play, Characters, Leaderboard, Profile, and info routes, their shared controls, animated components, and the shared balloon rig. This is a proposed sound palette and audition collection; no playback behavior has been added to the app.

## Screen coverage

| Area / source | Interactions and proposed cues |
|---|---|
| `LetterKeyboard.tsx`, Play route | Accepted guess: `key`. Correct: `correct`, quiet `tile`; incorrect: `wrong` then balloon sequence. Completed word: `win` + selected voice `joy`. Lost word: `loss` after the fall. Repeated/disabled guesses stay silent. |
| `RoundParts.tsx`, Play result | Next word: `primary` then `deal`; Change character: `tap` or `tab`. Paid two-letter reveal: `token-spend`, `letters`, token flight. A simultaneous repeat letter gets one aggregate reveal cue, not one sound per tile. |
| `GameScene.tsx`, `balloons.js` | `stretch`, `pop`, `sink`; final balloon uses `last-stretch`, `last-pop`, `string`, `fall`, `impact`, `bounce`, `dust`, `stars`; character voices `worry`, `fall`, `land`, `recover`. Result stamp uses `stamp`. Spark bursts belong to the associated result/reward cue. |
| `TokenFlight.tsx`, `TokenPill.tsx`, `PayButton.tsx` | Gaining: `token-gain`, `token-flight`, `token-land`, quiet `count`. Spending: `token-spend`, `token-flight`, `spend-land`, optional quiet `count`. Insufficient balance: `refused` only. No success cue on refusal. |
| `StreakTakeover.tsx`, `Confetti.tsx` | `streak-open`, `streak-fill`, `star-land`; full meter adds `streak-bonus` and `confetti`. The reward uses the token family. Early tap dismissal can use `panel-close`, cancelling remaining scheduled layers. |
| `LevelChange.tsx`, `LevelPath.tsx` | Entrance: `panel-open`; upward/downward travel: `level-rise` / `level-slide`; arrival: `level-up` / `level-down`. Summit adds `summit`, `fog`, `confetti`, `crown`, selected `joy`. Use `summit` instead of stacking both victory stings. |
| `LevelMap.tsx`, header level pill | `map-open` and `map-close`. The path, decorative clouds, scrolling, and bobbing marker stay quiet. Level badge spring after a level change belongs to the existing level-arrival cue. |
| Characters route, `CharacterShop.tsx` | Arrows and grid card selection: `browse`. Choose an owned character: `choose` + its `hello`. Successful unlock: token-spend family, `latch`, `unlock`, `confetti`, `ribbon`, `hello`. Play with selected character: `primary` or `tab`. No repeated greeting on rapid browsing. |
| `TabBar.tsx`, `GameHeader.tsx`, `Raised.tsx` | Different enabled tab: `tab`; back: `back`; avatar/profile: `panel-open`; secondary actions: `tap`; prominent actions: `primary`. A dedicated cue takes precedence over an ordinary click. `Raised` is only a visual surface; it must not emit audio on mount. |
| Profile route, `Profile.tsx` | Pencil/name: `edit`; random-name dice: `dice`; changed valid save: `name-save`; refused save: `name-invalid`; Cancel: `panel-close`. Saving an unchanged name closes quietly or uses a soft ordinary tap. Character avatar and Change character use navigation cues. |
| Profile settings and info rows | Rules, privacy, terms, support, credits: `panel-open`; back: `back`; external dictionary links: `link`. Static stats, noninteractive rows, disabled language and unavailable settings remain silent. |
| Account deletion | Open confirmation: `delete-open`; accepted confirm: `delete-confirm`; Keep playing/backdrop/cancel: `panel-close`; successful reset: `delete-complete`; offline failure: `operation-failed`. No celebration, persistent loading noise, or repeated busy-button cue. Preview buttons only play audio. |
| Leaderboard route, `Leaderboard.tsx` | Period change: `period`; deliberate pull-to-refresh release or Try again: `refresh`; successful manual refresh: `board-ready`; failure after that action: `offline`. Rows, list scrolling, empty-state text, and background sync remain silent. |

## Animation timing

Times below start at the named animation, not at app startup. Card animations include their entrance. Measurement and network waits are examples in the preview and must not become fixed success timers in a future integration.

| Animation | Audio landmarks |
|---|---|
| Ordinary balloon pop, 900 ms | Stretch at 0; pop at **144 ms** (16%); short sink/rebound after the burst. |
| Last balloon, 2200 ms | Pop **352 ms**; held in air until **836 ms**; falling air/voice from **836 ms**; main impact **1320 ms**; smaller second contact **1584 ms**; one brief dust/stars/recovery phrase. |
| Result stamp | Normal win: **700 ms** after round completion; loss: **2600 ms**. When a streak takeover intervenes, the stamp belongs to the actual result reveal. |
| Token gain | Appearance 240 ms + hold 300 ms; launch **540 ms**, flight 620 ms, arrival **1160 ms** after the chip appears. |
| Token spend | Appearance 240 ms + hold 120 ms; launch **360 ms**, arrival **980 ms**. Payment is accepted before this sequence. |
| Streak takeover | Entrance 280 ms + wait 380 ms; fill begins **660 ms**, lasts 620 ms; star and reward launch sequence begin **1280 ms**; full-meter burst **1540 ms**. |
| Level card | After its own open: entrance 280 ms + wait 450 ms; travel begins **730 ms**. Up takes 950 ms, arrives **1680 ms**; down takes 1150 ms, arrives **1880 ms**. |
| Summit | Fog and confetti begin with arrival; fog lasts 700 ms. Crown spring begins at arrival; the audition contact is **180 ms into that spring**, an artistic placement rather than a fixed app callback. |
| Character unlock | Lock/reveal/voice are placed around the purchase acknowledgement; ribbon is a spring, so its exact sound contact is an audition choice. Confetti is 1700 ms. |

The final-fall preview uses the actual shared `BalloonAnim` frames. Other preview scenes use small representative UI elements to expose the sound order; they are not a second implementation of the game.

## Variation, layering, and silence

- Cycle through the 2–5 supplied takes on frequent interactions, avoiding immediate repeats. Do not randomize pitch so far that the sound changes identity.
- One primary cue per accepted action. Use either the dedicated cue or the generic button click; avoid both. Supporting animation layers are quieter and optional.
- One short character reaction at a time. A worried voice can respond to occasional misses, rather than every miss; the fall/landing/recovery form one deliberate sequence. Browse voices need a pause before greeting, and a cooldown.
- Suggested future balance: keys/navigation lowest, ordinary confirmation in the middle, rewards/voices/impact more prominent. Music should leave room for the short vocal and transient layers. The audition mixer lets these choices be judged together.
- Counter sounds are a brief 2–4 tick burst, not one sound per token. Large bonuses must not produce hundreds of ticks. Coin spin and sparkle belong to that same event.
- Cancel remaining scene sounds when the user dismisses a takeover or navigates away. Do not replay saved rewards/results when restoring the app. Background network activity should never trigger score-refresh sounds.
- No loops for idle character breathing, floating balloons, character-shop sunrays, star shimmer, rotating coins, clouds, loading, or scrolling. No duplicated typing sounds over the operating-system keyboard in Profile. The in-game letter keyboard has its own cue.
- The description is always visible and free: there is no description/reveal-button sound. Hint words were removed. Versus, language selection, and unbuilt sound settings have no proposed active sounds.
- Reduced motion does not imply muted audio. Sound settings, platform silent-mode behavior, haptic coordination, and background interruption handling belong to the later, explicitly approved integration.

## Character voice coverage

All 15 characters—Mochi, Bun, Coco, Biscuit, Pip, Bao, Koa, Lolo, Rocco, Ember, Sage, Rexy, Vesper, Button, and Ribbit—have **hello, joy, worry, fall, land, recover**. These 90 separate files have individual vocal profiles and are synthesized without speech or actor recordings. Character timbre and emotional readability require listening approval.

The full per-cue element, trigger, source path, variation count, and duration are recorded in `manifest.json` and exposed in the listening board. The pack contains 65 effect families / 150 takes plus 90 voices, for 240 sound files in each audio format.
