# Hanged: second listening round

2026-10-23. **In the game.** The owner put it in the app on the day it was made. It plays fourth in the music playlist (`scripts/audio-assets.js`).

| Sketch | Length | Direction | Instruments |
| --- | --- | --- | --- |
| D — Last Balloon | 2:11 | Wistful, warm ballad that builds to a guitar-led peak, then settles | Nylon guitar melody, fingerpicked steel guitar, strings, cello, piano, clean electric lead |

Play `04-last-balloon.mp3`.

## The brief

The owner asked for an instrumental piece with the feel of a reference video: a guitar-and-strings cover of a C-pop ballad (YouTube `m8y2ry0L8vQ`). They wanted something similar in tone, not a copy.

Only the reference's **measured, whole-track traits** were used: about 76 BPM, D major, most energy in the warm 150–600 Hz range, about 1.4 note onsets per second, and a slow build from a quiet start to a full peak and a soft ending. No melody, chord progression, bass line or arrangement was transcribed. The reference audio is not stored in the repository.

The draft's own material is new:

- **Harmony:** a theme that climbs one step at a time (Dmaj7, Em7, F#m7, Gmaj7), darkened by a borrowed Gm6. It avoids the common descending-bass pop progression.
- **Melody:** written for this piece.
- **Peak:** a clean electric guitar ornaments the theme an octave up, a nod to the reference's guitar solo.

Measured on the render, the draft matches the brief: 76 BPM, D major, 1.39 onsets/s and 62% of its energy in 150–600 Hz. It has less deep bass than the reference (9% below 150 Hz against 21%).

## Form

| Bars | Section |
| --- | --- |
| 1–4 | Intro: guitar alone |
| 5–12 | A1: theme on nylon guitar; strings come in for the second half |
| 13–20 | A2: the theme reaches higher; cello answers |
| 21–28 | B: the release; strings swell and cello holds the roots |
| 29–36 | Peak: electric lead, everything at its fullest |
| 37–40 | Outro: one guitar, slowing to rest |

Like the first round, every bar names its own picking shape, so there is no repeating accompaniment loop and no percussion.

## Rendering

`compose.py` reuses `Sketch` and `render` from [../first-listen/compose.py](../first-listen/compose.py), with the same instrument bank, renderer and audition master settings (see [../first-listen/README.md](../first-listen/README.md)). The WAV master's location is in `tracks.json`.

```powershell
python design/audio/second-listen/compose.py --fluidsynth <fluidsynth.exe> --soundfont <GeneralUser-GS.sf2> --renders <external-master-directory>
```

## In the app

The app bundles the MP3 (3.0 MiB) as the fourth track of the playlist. It is mastered to the same -19 LUFS as the first-round tracks, so the app's music volume needs no change. After re-rendering, run `node scripts/audio-assets.js` so the app picks up the new duration.
