# Music, effects, and character voices

The owner requested app integration on 2026-10-22, including music at a reasonable volume. All 65 cue families (150 takes), 90 character reactions, and three music tracks are now connected to the app. The original standalone listening boards remain available for design review.

- Music: `design/audio/first-listen/listen.html`, three original tracks, MIDI/score sources and rendering notes alongside them.
- Effects and character voices: `design/audio/effects/soundboard.html`. The board includes the previous music for auditioning combinations.
- [Effects documentation](../design/audio/effects/README.md): file formats, generation, playback, and provenance.
- [Interaction audit](../design/audio/effects/AUDIT.md): coverage, specific UI triggers, animation timings, and deliberate silence.
- `catalog.cjs` is the proposed cue inventory, `synthesize.cjs` renders the original effects/wordless voices, and `scenes.cjs` defines audition sequences. `build.cjs` packages the standalone board from those sources and the shared character scripts.

The owner dislikes generic ukulele, whistles, claps, and repetitive beats. Effects should be satisfying. Character vocal identities should differ beyond pitch, and frequent interactions should use variations. Landing sounds are comic and cushioned; characters are never hurt.

## Runtime

- `src/audio/assets.ts` is a generated, statically required inventory. Regenerate with `node scripts/audio-assets.js` after changing the collection. Metro bundles the MP3s directly from `design/audio/`; WAVs, scores, HTML, and ZIPs are not imported. The audio payload is about 5.44 MiB and works offline in installed builds.
- `engine.ts` owns a bounded cache of 48 effect/voice players, at most 8 concurrent effect layers, and one music player. Frequently used effects and the selected character are warmed. Takes rotate without immediate repetition. An asset that loads over 250 ms after its requested onset is dropped rather than played out of sync. No gameplay action waits for audio.
- `backend.ts` uses Expo SDK 58's `expo-audio` (`createAudioPlayer`, `remove`, `setAudioModeAsync`). Playback mixes with other apps, respects the iOS silent switch, and does not play in the background. Recording permissions, recording, background playback, and media services are disabled in the config plugin. A player's `ready` resolves on the load event *or* when polling `isLoaded` sees it, and rejects on a load error or after 20 s: a missed or failed load used to leave the music waiting forever while effects kept working.
- iOS can pause a player without telling JS (interruptions, route changes, the session going idle). `SoundPlayer.playing` reports what the platform is really doing. If music was started over a second ago and is not playing, or its load failed, the next touch (`unlock`) or return to the foreground restarts or rebuilds it.
- `backend.web.ts` uses Web Audio with a shared compressor so gain works on mobile Safari too. Assets come through `expo-asset`. The first pointer/touch/key gesture unlocks browser audio; there is no autoplay permission prompt.
- `AudioProvider` owns initialization/disposal, saved preferences, and AppState handling. Navigation invalidates queued scenes; `useSoundScope` also follows route focus because frozen tabs can keep their timers alive. A scope's `continuation()` guards async replies from a page that was left, muted, or backgrounded.
- No sounds play from the reducer. Existing score, rewards, purchase rules, and storage remain authoritative. `soundEnabled` and `musicEnabled` are local saved booleans, defaulting true for old saves; no save version bump. They are not sent to the server. Voices follow the effects switch.

## Mix and music

`MIX` in `engine.ts` is the one balance control: effects **0.55**, voices **0.62**, music **0.22**, ducked music **0.09**. These multiply the already leveled masters, not full-scale raw synth output. Music fades between levels over 320 ms. Voices and large rewards lower the music briefly. Only one character voice speaks at a time; ordinary worried reactions happen every third miss, not on every key. Counter ticks stop after three even on a large payment.

The playlist plays Little Detours, Sunday Window, then Updraft, with four seconds of breathing room between full tracks. It continues across screens, pauses/resumes with the music switch or app lifecycle, and never repeats a short beat loop. Turning effects off cancels existing and queued effects immediately without muting the music.

## Placement

- Play verifies accepted guesses with the engine before sounding the key, correct/wrong response, and one tile cue. A win celebrates once; result stamps and the loss response follow the actual reveal, so streak takeovers do not duplicate the result cue. Restored results stay quiet. Next word plays the deal sound.
- `GameScene` schedules the balloon sequence when the actual stage changes, using the shared rig's duration. Final pop is at 16%, fall 38%, impact 60%, second contact 72%; changing character alone does not replay a pop. Interrupting a transition cancels its remaining layers.
- Token appearance/flight belong to `TokenFlight`; arrival and bounded counter ticks belong to `TokenPill`. Refusals never play a purchase success cue. Restored balances do not sound.
- Streak opening/fill follow the card entrance. Star and bonus cues follow actual phase changes. Level arrivals, fog/confetti/crown, and voices follow the native animation completion callback. Dismissed and hidden scenes cancel their audio.
- Character browsing, choosing, unlocks, ribbon, confetti and character greetings use the viewed character. Browsing quickly cancels an old greeting rather than speaking on every swipe.
- Navigation, map opening/closing, Profile editing/saving/random names, validation, deletion, links, and user-requested Leaderboard refresh success/failure use the corresponding inventory cues. Background refreshes, idle motion, disabled controls, OS keyboard typing, and the always-visible description remain quiet.
- Onboarding reuses choose/hello for buddy selection, dice and name-invalid for name/consent feedback,
  panel cues for the legal sheet, and primary/joy for lift-off. Idle figures are quiet; there are no new assets.
- The loading screen plays `tile` as each letter of the wordmark turns and `level-rise` on lift-off, with one
  haptic tap when the word is solved; cues a tap skipped over stay quiet ([branding.md](branding.md)).

Tests cover take rotation, cancellation/mute, stale loads/async replies, voice exclusion, ducking, playlist transitions, resource bounds, inventory completeness, animation landmarks, and save migration. Export bundles are checked for iOS, Android, and web. Real-device listening remains necessary to judge speaker balance and native playback latency.

Future timbre changes should still be auditioned in the standalone board before replacing the approved collection.
