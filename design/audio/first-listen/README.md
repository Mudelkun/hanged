# Hanged: first listening round

2026-10-22. **Drafts for the owner's approval. No app integration.**

Open [listen.html](listen.html) in a browser, or play the three MP3s directly.

| Sketch | Length | Intended direction | Instruments |
| --- | --- | --- | --- |
| A — Little Detours | 52 s | Main theme: curious, conversational, lightly mischievous | Clarinet, piano, pizzicato strings, bassoon |
| B — Sunday Window | 49 s | Play: warm, unhurried, cheerful without becoming sugary | Piano, acoustic bass, sparse vibraphone |
| C — Updraft | 55 s | World/map: airy and gently uplifting | Cello, harp, piano, soft strings |

## The brief

- The owner listens and approves before any music goes into the app.
- Avoid generic ukulele, whistles, claps, and repetitive beats.
- This first pack explores music directions. Effects and character sounds follow in a separate approval round.
- No percussion tracks or copied accompaniment loops. Every melodic phrase is written explicitly; entrances and accompaniment positions vary. Related motifs return with changed notes, harmony, or endings.
- These are instrument-sample mockups, not recordings of live performers or final production masters.

## Research and what it changed

- [Adam Robinson-Yu on A Short Hike's evolving soundtrack](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/): describes instruments entering and leaving with the player's location. The takeaway for this brief is changing instrumentation and density. It does not require a repeating beat.
- [Mark Sparling's soundtrack notes and listening reference](https://marksparling.bandcamp.com/album/a-short-hike-original-soundtrack): the composer describes short and long presentations of the soundtrack's instrumental layers. Used as a structural reference; no audio or melody is copied into these sketches.
- [Scruffy's game-audio research and composer/developer interviews](https://scruffymusic.com/videos.html): includes *Musical Maps in A Short Hike* with Mark Sparling and *Creating the Chill World of Here Comes Niko!* with its developers. Located as further listening references. The video audio was not available for direct audition in this session.

The arrangements here are our own interpretation of the brief, not claims about how all playful game music should sound.

## Composition and rendering

`compose.py` contains the original melodies, chord voicings, accompaniment placements, and instrumental responses. It writes MIDI files and readable note-event scores. Its random seed only adds slight performance variation in timing and velocity; it does not select notes. Phrase tempos ease at cadences.

Instrument source: **S. Christian Collins' GeneralUser GS 2.0.3**, rendered with **FluidSynth 2.6.1**. See the [author's site](https://www.schristiancollins.com/generaluser.php), [source repository](https://github.com/mrbumpy409/GeneralUser-GS), and supplied `GeneralUser-GS-LICENSE.txt`. The license permits music creation and also records uncertainty about the historical provenance of some samples; a final production instrument library can be chosen after the musical direction is approved. The SoundFont itself is not bundled here or in the app.

MP3s are 192 kb/s stereo. WAV masters are rendered at 48 kHz / 24-bit outside the repository; their locations are recorded in `tracks.json`. The audition target is about -19 LUFS with a -2 dBTP ceiling, keeping some musical dynamics. Every sketch has a complete ending and tail; these are not seamless loops.

No app source, dependencies, settings, or feedback hooks are changed. No service account or paid generation is needed for these local sketches. Runway was identified as an optional tool for future music generation, but these drafts do not use it.

To regenerate MIDI and score files using Python's standard library:

```powershell
python design/audio/first-listen/compose.py
```

To render, add `--fluidsynth <path-to-fluidsynth.exe> --soundfont <path-to-bank.sf2> --renders <external-master-directory>`. FFmpeg must be available on PATH. Portable tools and the instrument bank used for this audition are in `%TEMP%\hanged-audio-tools`; the renderer accepts other locations.

## Approval

Awaiting the owner's listening feedback. Useful feedback: A/B/C, instrument sounds to keep or change, and timestamps that feel too busy, too childish, too repetitive, or too artificial. Approval of a musical direction is separate from approval to integrate it.
