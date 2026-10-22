# Hanged — sound playground

Open **[soundboard.html](soundboard.html)** in a browser. It contains the audio and character artwork, works offline, and needs no server. The collection has also been integrated into the app at the owner's request; runtime placement and volume controls are documented in [Context/audio-design.md](../../../Context/audio-design.md). The ZIP preserves the original audition snapshot.

- **65 effect families**, with **150 individual takes**.
- **15 character voices × 6 reactions = 90 vocal files**.
- **14 composed scenes**, including the last balloon and fall, winning, spending, streaks, unlocking, level changes, and reaching the summit.
- An editable mixer: add any effects or voices, set delay and level per layer, then play them together. “Start all at once” clears the delays.
- The three previous music samples are included at an adjustable background level. They play once, with no automatic repetition.
- Individual effects have a take selector and MP3 download. All 240 effects and voices have separate WAV masters and MP3 previews in `audio/`.

## The palette

Tactile wooden clicks, rounded rubber snaps, soft air, cushioned impacts, and small metallic rewards. Musical rewards use short, original phrases; there is no repeating percussion bed. No ukulele, whistles, or claps.

Frequently repeated actions have several takes, with small differences in resonance, pitch, envelope, and texture. Their preview buttons cycle through the alternatives. An ordinary click stays quieter than a reward or an impact.

The voices are **original synthesized, wordless creature vocalizations**, not recorded actors. Each character has its own pitch range, formant scale, vowel choices, breath, roughness, modulation, and pacing. Each has a greeting, delight, worry, fall, landing grunt, and dazed recovery. The landing is comic exertion: the characters are never hurt.

These are audition proposals. The board intentionally exposes supporting layers individually; approving every asset does not mean every layer should fire on every interaction. See [AUDIT.md](AUDIT.md) for placement, timing, reuse, and where silence belongs. Subjective approval comes from listening to the board.

## Files and reproduction

| File | Purpose |
|---|---|
| `soundboard.html` | Portable listening board, with embedded MP3s and artwork |
| `audio/wav/` | 240 mono, 48 kHz, 16-bit PCM WAV masters |
| `audio/mp3/` | 240 mono, 128 kbps MP3 previews |
| `manifest.json` | Names, triggers, UI sources, durations, voice identities, and scene timelines |
| `audio-checks.json` | Render checks and individual WAV SHA-256 hashes |
| `review-checks.json` | Browser decoding, layout, controls, and layered-render checks |
| `catalog.cjs` | Interaction inventory and character voice profiles |
| `synthesize.cjs` | Original procedural synthesis and vocal formants |
| `scenes.cjs` | Explicit scene event times and relative levels |
| `build.cjs` | WAV/MP3 renderer and HTML packager |
| `soundboard.template.html` | Editable board source |

From the repository root, with Node and ffmpeg available:

```sh
node design/audio/effects/build.cjs
```

For board, catalog text, or scene-timing edits that do not change sound synthesis:

```sh
node design/audio/effects/build.cjs --board-only
```

Rebuilding requires the existing `design/characters/rig.js`, `design/characters/balloons.js`, and the three MP3s in `design/audio/first-listen/`. The generated board embeds those assets. Character art is taken from the shared source, never maintained as a separate drawing. Source scripts and renders are deterministic.

The browser schedules decoded audio against a single Web Audio clock, so simultaneous layers share a start time. Delays are relative to that clock. A compressor and soft output limiter provide headroom for combinations; the master and music controls are independent. Stop all, or Escape, cancels active and queued audio. Music and effects can overlap, with no autoplay or looping.

## Provenance and reference reading

All SFX and vocal audio were composed and synthesized for this collection from oscillators, noise, resonators, and formant filters. No downloaded effects, voice samples, or third-party sound recordings were used.

The embedded music is the previously delivered first-listen set. It was composed as original note-event scores and rendered with GeneralUser GS 2.0.3; its accompanying license is included as `GeneralUser-GS-LICENSE.txt`. The SoundFont itself is not included.

Reference reading informed vocal personality and reliable layered playback, without copying reference audio:

- [Boom Box Post — Creature Vocals: Concept & Design](https://www.boomboxpost.com/blog/2021/11/9/lunch-and-learn-creature-vocals-concept-and-design)
- [MDN — AudioBufferSourceNode.start](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start)
- [MDN — decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)

Technical validation checks decodability, non-silence, unique renders, finite samples, faded waveform edges, and available headroom. It does not substitute for the user's judgment of timbre and satisfaction. Chrome was used for the automated desktop/mobile-layout review; native-device listening remains part of approval.
