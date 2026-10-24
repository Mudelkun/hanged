# Hanged: versus listening round

2026-10-24. **In the game.** The owner asked for competitive music for Versus and put these three in the app the same day: each match plays its mode's loop.

Open [listen.html](listen.html) in a browser. Served over http (or published) it loops each one gaplessly with Web Audio; opened from the file system it falls back to the audio element, which can leave a tiny gap at the wrap that the app does not have.

| Sketch | Mode | Loop | Tempo, key | Direction | Instruments |
| --- | --- | --- | --- | --- | --- |
| E — Photo Finish | Word Rush | 1:55 | 150 BPM, E minor | A race against the clock: riff, theme, a ticking-clock breakdown, a last lap | Brass section, trumpet, muted guitar, pizzicato and tremolo strings, picked bass, horns, timpani, drums |
| F — Pop Rivals | Balloon Battle | 1:56 | 132 BPM, F major | Two rivals trading phrases (trumpet left, clarinet right), a chase, balloon "pops" | Muted trumpet, clarinet, clavinet, finger bass, xylophone, pizzicato, brass section, drums, tambourine |
| G — Your Move | Word Duel | 2:00 | 112 BPM, C minor | A game of nerves: a 3+3+2 clock figure, cello theme, a near-silent thinking pause | Cello, horns, piano, pizzicato, tremolo and full strings, contrabass, celesta, timpani, drums |

## The brief

The owner asked for separate, competitive music for multiplayer: at least two tracks. The solo rules still apply: no ukulele, whistles or claps, no repetitive beat.

What makes these competitive rather than solo tracks:

- **Seamless loops, steady tempo.** A match must never land on a final chord and four seconds of silence the way the solo playlist does. Each loop is cut so its end flows into its start (below), and the tempo never slows.
- **Faster pulse and more drums** than the solo tracks (112–150 BPM against 76–100), but written per bar: every bar names its own groove, with fills every four or eight bars and breakdowns, so no beat repeats as a loop.
- **A shape in two minutes.** Each loop lasts about one Word Rush match and has a calm section and a peak (measured: the breakdowns sit 3–5 dB under the peaks). After the peak, the intro works as a breath before the next lap.
- **Room to think.** Players still read a clue and pick letters. The busiest lines sit in the sections between the melodies, the drums stay below the lead, and everything is mastered to the same −19 LUFS as the solo tracks, so the effects and voices keep their balance.

## Form

| Photo Finish (bars) | | Pop Rivals (bars) | | Your Move (bars) | |
| --- | --- | --- | --- | --- | --- |
| 1–4 | Intro: stabs and hats | 1–4 | Intro: walking bass, tiptoeing pizzicato | 1–4 | Intro: the clock figure alone |
| 5–20 | Riff, then brass and horns trading | 5–20 | Trading: trumpet calls, clarinet answers | 5–20 | Theme on cello, then an octave up with a dark D♭ turn |
| 21–36 | Theme | 21–28 | Tug of war: both lines in contrary motion | 21–28 | Horns press the point |
| 37–44 | The clock: woodblock tick-tock, snare build | 29–36 | Chase: D minor, one bar each | 29–36 | Thinking: celesta ticks, held strings |
| 45–52 | Riff again over 16th-note strings | 37–44 | Sneak: pizzicato and brass "pops" | 37–52 | Full theme, strings doubling the cello |
| 53–68 | Last lap: theme on brass and trumpet | 45–60 | Swapped: the rivals trade lines, xylophone on top | 53–56 | Turn: timpani hands the clock back |
| 69–72 | Turn: toms back to the intro | 61–64 | Unison run back to the intro | | |

## Composition and rendering

`compose.py` writes every note. Rhythm parts (drums, ostinatos, bass, guitar) are 16-step patterns per bar, indexing the bar's chord; melodies are written note by note in the same `pitch:duration` lines as the earlier rounds. It reuses `Sketch`, `synthesize` and `master` from [../first-listen/compose.py](../first-listen/compose.py), with the same instrument bank (GeneralUser GS 2.0.3), FluidSynth settings and −19 LUFS / −2 dBTP target (see [../first-listen/README.md](../first-listen/README.md)).

**How the loop is cut.** The loop is rendered after a pre-roll of its own last two bars and followed by its first two, and each bar's performance seed is fixed, so a bar sounds the same wherever it plays. The master is cut from the start of bar 1 to the start of bar 1 again, and its first 60 ms are crossfaded from the audio that really follows the end. The wrap is the real continuation: measured on the masters, the jump at the seam is 5–10 times smaller than an ordinary sample step.

```powershell
python design/audio/versus-listen/compose.py --fluidsynth <fluidsynth.exe> --soundfont <GeneralUser-GS.sf2> --renders <external-master-directory>
```

`tracks.json` records each loop's exact length (`loop_seconds`), the WAV master's location and the loudness measurement.

## In the app

The loops ship as AAC `.m4a` at 160 kb/s (about 2.4 MB each). An MP3's encoder padding would leave a gap at every wrap, and expo-audio loops an AAC item gaplessly on iOS. A match plays its mode's loop from the countdown to the last round; the lobby, queue and results keep the solo playlist. How it works: [Context/audio-design.md](../../../Context/audio-design.md). After re-rendering, run `node scripts/audio-assets.js` so the app picks up the new loop lengths.
