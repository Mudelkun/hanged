# Music and effects audition assets

Audio is currently a **standalone design review**, not integrated into the Expo application. The owner wants to listen and approve before integration.

- Music: `design/audio/first-listen/listen.html`, three original tracks, MIDI/score sources and rendering notes alongside them.
- Effects and character voices: `design/audio/effects/soundboard.html`. The board includes the previous music for auditioning combinations.
- [Effects documentation](../design/audio/effects/README.md): file formats, generation, playback, and provenance.
- [Interaction audit](../design/audio/effects/AUDIT.md): coverage, specific UI triggers, animation timings, and deliberate silence.
- `catalog.cjs` is the proposed cue inventory, `synthesize.cjs` renders the original effects/wordless voices, and `scenes.cjs` defines audition sequences. `build.cjs` packages the standalone board from those sources and the shared character scripts.

The owner dislikes generic ukulele, whistles, claps, and repetitive beats. Effects should be satisfying. Character vocal identities should differ beyond pitch, and frequent interactions should use variations. Landing sounds are comic and cushioned; characters are never hurt.

Do not add playback hooks or dependencies, change the live sound behavior, or treat the pack as approved without the owner's instruction. New sound work belongs in the audition collection first.
