# Onboarding

Reference: [design/onboarding/onboarding.html](../design/onboarding/onboarding.html) and its PNG.
Routes: `src/app/onboarding/index.tsx` (buddy) and `name.tsx` (name and consent), with an Expo Router
Stack and `OnboardingProvider` keeping the draft when going back or opening the legal sheet.
UI: `src/components/Onboarding.tsx`; artwork and transition: `OnboardingArt.tsx`.

## Flow and design

- The welcome is the buddy picker. Coco and Bun are free; Coco starts selected. Both float under ten
  balloons. Tapping either the figure or its card brings it forward, cheers, changes its speech bubble,
  and changes “Let’s go, …!”. No price or gender labels. The logo (here and on the language page) is the
  brand's compact wordmark, `Wordmark` ([branding.md](branding.md)), so it carries over from the loading screen.
- **Friend invites** (2026-10-24, [versus.md](versus.md), Invite links): the first screen (language) shows
  `OnboardingInvite` under the wordmark: "Roda invited you! You'll be friends as soon as you start playing"
  when an invite waits, or on iOS, when the clipboard holds a URL, "Got an invite link from a friend?" with
  the system Paste button. The invite is accepted by itself once onboarding completes; nothing else changes.
- The second screen starts with the same friendly random name supplied by `GameProvider`. The name,
  dice, 15-character limit, and messages reuse `PlayerNameInput`, `nameHelp`, `checkName` and `randomName`
  with Profile. The wooden sign follows the draft; an invalid name tilts it and worries the character.
  A too-short name waits for the attempted submission, matching Profile. Play asks the server whether the
  name is free (names are unique, [profile.md](profile.md)); offline it goes through and the sync settles it.
- Consent is never preselected. A pale Play button stays tappable to explain a refusal: invalid names
  focus the field; missing consent wiggles the checkbox and shows “Tick the box to start playing”.
  The keyboard’s Done key only dismisses the keyboard. The name screen scrolls above the keyboard.
- Terms and Privacy open a bottom sheet with tabs. Closing it preserves both the name and checkbox.
  `InfoContent`/`LegalDocument` are also used by Profile, and need no network.
- **Legal text is still a draft placeholder**, exactly as in the design, not an authored policy. Replace
  its headings/placeholder lines with approved bundled text and change `LEGAL_VERSION` before release.
  The current version is explicitly `2026-10-22-draft`, so accepting this preview never counts as accepting
  the eventual release text.
- A successful new-player submission runs the 1,500 ms lift-off, then completes onboarding in one reducer
  action. The picked buddy descends into the real Play scene; the existing “Nice to meet you” message
  shows for 2,400 ms. This welcome is transient context state, so restarting does not replay it.
- The first round is the existing random level-one round. Its clues, tokens and rewards follow the game
  configuration; the reference’s FISH word and zero token balance are illustrative, not new game rules.

## Save, routing and existing players

`src/game/onboarding.ts` owns starter IDs, timings, legal version and `needsOnboarding`.
`GameState` adds `onboardingCompleted` and `legalAcceptance: { version, acceptedAt } | null` to the existing
`hanged.game.v1` save. Acceptance time is epoch milliseconds supplied by the event handler.

- New state has `onboardingCompleted: false` and no acceptance. Finishing validates the name, actual
  acceptance, timestamp and free starter inside the reducer. It preserves the already-dealt round.
- `hydrate` detects legacy saves **before filling defaults**. Missing `onboardingCompleted` means an existing
  player: retain their character, name, round, balances, level, purchases and reports; show only consent.
  Explicit `false` stays false, including a fresh installation closed halfway through onboarding.
- Existing players and players whose accepted legal version is outdated go directly to the consent screen.
  They cannot change identity there, and resume without lift-off or a new word.
- Root `Stack.Protected` gates the tabs, Profile and info routes. A deep link cannot skip onboarding.
  Completion switches to Play automatically and removes the onboarding history. Deletion resets the save
  and returns to the buddy picker; Profile no longer issues a conflicting navigation after the reset.
- The splash waits for fonts, save, first round and friendly name, then the loading screen plays over the
  app ([branding.md](branding.md)); for a new player it has no buddy and fades into onboarding. Delete/reset deals a round and assigns
  a fresh name in the same batch so the application providers remain mounted.
- The provider passes no state to sync and starts no sync until current consent is saved. Completion
  starts the normal background sync; network success is never required to play.

## Reuse and animation

Characters and balloons come directly from `design/characters/rig.js` and `balloons.js`, with the same
view boxes and frame adjustments as the HTML. `OnboardingBalloon` renders 20 frames/s only while focused
and active, and pauses in the background. Inactive buddies use a still frame. Selection, lift-off,
speed lines, sign tilt and welcome motion use native transforms; no 3D transforms.

`structureKey` is shared with the game scene to avoid stale native SVG attributes on iOS.
`WoodenSign` is shared with the level map, `Tile` with Play, `Avatar` with the existing headers,
and `BigButton`/`Raised` with the other screens. The paper pattern uses a per-instance SVG ID so a hidden
route cannot hide the pattern of a visible route on web. Every UI string is in `en.json`.

Regression coverage: reducer validation, legacy/fresh-save migration, version changes, reset, both starter
choices, unchecked consent, invalid names, policy tabs/draft preservation, and transition completion.
Browser checks cover the complete flow, persisted identity, reload, direct-route gating and compact layout.
Native keyboard behavior and speaker balance still need a real-device check.
