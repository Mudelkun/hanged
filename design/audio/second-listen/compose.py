"""Last Balloon: an original guitar-and-strings ballad sketch, for audition only.

Style brief from a reference's measured traits only (about 76 BPM, D major,
warm low-mid sound, a slow build to a guitar-led peak, a quiet ending). No
melody, chord progression or arrangement was transcribed from it; every note
here is written below. Reuses the Sketch class and renderer of first-listen.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "first-listen"))
from compose import Sketch, render, render_args  # noqa: E402

# Fingerpicking voicings, low string first.
VOICING = {
    "Dmaj9": "D2 A2 E3 F#3 C#4", "Dmaj7": "D2 A2 F#3 A3 C#4", "Em7": "E2 B2 D3 G3 B3",
    "F#m7": "F#2 C#3 E3 A3 C#4", "Gmaj7": "G2 D3 F#3 B3 D4", "Gm6": "G2 D3 E3 Bb3 D4",
    "Asus4": "A2 E3 A3 D4 E4", "A7": "A2 E3 G3 C#4 E4", "A6": "A2 E3 F#3 C#4 E4",
    "Bm7": "B2 F#3 A3 D4 F#4", "A/G": "G2 E3 A3 C#4 E4", "B7": "B2 F#3 A3 D#4 F#4",
    "F#7": "F#2 C#3 E3 A#3 C#4",
}

# Picking shapes as (beat, string, ring). Each bar names its own shape below,
# so the accompaniment never settles into one repeating loop.
PICK = {
    "flow": [(0, 0, 3.8), (.5, 2, 1.5), (1, 3, 1.2), (1.5, 4, 1), (2, 1, 1.8), (2.5, 3, 1), (3, 4, .8), (3.5, 2, .5)],
    "lean": [(0, 0, 3.5), (.75, 3, 1), (1.5, 4, 1.5), (2.5, 2, 1), (3, 3, .8)],
    "open": [(0, 0, 3.8), (.5, 1, 3), (1, 4, 2.5), (2.5, 3, 1.4)],
    "lilt": [(0, 0, 2), (.5, 2, 1), (1, 4, 1), (1.5, 3, 1), (2, 1, 2), (2.75, 3, 1), (3.25, 4, .7)],
    "rise": [(0, 0, 3.6), (.5, 1, 1.5), (1, 2, 1.4), (1.5, 3, 1.2), (2, 4, 1.8), (3, 3, .8), (3.5, 2, .5)],
    "ring": [(0, 0, 4), (.25, 1, 3.6), (.5, 2, 3.4), (.75, 3, 3.2), (1, 4, 3)],
}

# (bar chords as (beat, name), picking shape), sections marked.
BARS = [
    # Intro: the guitar alone.
    ([(0, "Dmaj9")], "open"), ([(0, "Gmaj7")], "lean"), ([(0, "Dmaj9")], "open"), ([(0, "Asus4"), (2, "A7")], "lilt"),
    # A1: the theme climbs a step at a time, then a borrowed Gm6 darkens it.
    ([(0, "Dmaj7")], "flow"), ([(0, "Em7")], "lean"), ([(0, "F#m7")], "flow"), ([(0, "Gmaj7")], "open"),
    ([(0, "Em7")], "lilt"), ([(0, "F#m7")], "lean"), ([(0, "Gm6")], "open"), ([(0, "Asus4"), (2, "A7")], "lilt"),
    # A2: the same climb reaches further; cello answers.
    ([(0, "Dmaj7")], "rise"), ([(0, "Em7")], "flow"), ([(0, "F#m7")], "lean"), ([(0, "Bm7")], "flow"),
    ([(0, "Gmaj7")], "rise"), ([(0, "A/G")], "lean"), ([(0, "F#m7"), (2, "B7")], "lilt"), ([(0, "Em7"), (2, "A7")], "lilt"),
    # B: the release, strings swell.
    ([(0, "Gmaj7")], "rise"), ([(0, "A6")], "flow"), ([(0, "F#m7")], "rise"), ([(0, "Bm7")], "flow"),
    ([(0, "Em7")], "rise"), ([(0, "F#7")], "lean"), ([(0, "Bm7")], "flow"), ([(0, "Gm6"), (2, "A7")], "lilt"),
    # Peak: a clean electric guitar takes the line, everything at its fullest.
    ([(0, "Dmaj7")], "flow"), ([(0, "Em7")], "rise"), ([(0, "F#m7")], "flow"), ([(0, "Gmaj7")], "rise"),
    ([(0, "Bm7")], "flow"), ([(0, "F#7")], "rise"), ([(0, "Gm6")], "lean"), ([(0, "Asus4"), (2, "A7")], "lilt"),
    # Outro: back to one guitar, slowing to rest.
    ([(0, "Dmaj7")], "open"), ([(0, "Gmaj7")], "open"), ([(0, "Gm6")], "open"), ([(0, "Dmaj9")], "ring"),
]

THEME = {  # nylon guitar, bar: line
    4: "-:1 A4:0.5 D5:0.5 E5:1.5 F#5:0.5",
    5: "E5:1 D5:0.5 B4:1 -:0.5 G4:0.5 A4:0.5",
    6: "C#5:1.5 A4:0.5 E4:1 -:1",
    7: "-:0.5 D4:0.5 F#4:0.5 A4:0.5 B4:1.5 A4:0.5",
    8: "G4:1 F#4:0.5 E4:0.5 B4:1.5 D5:0.5",
    9: "C#5:1 E5:1 A4:1.5 -:0.5",
    10: "Bb4:1.5 G4:0.5 E4:1 D4:0.5 E4:0.5",
    11: "D4:2 C#4:1 -:1",
    12: "-:1 A4:0.5 D5:0.5 E5:1 F#5:0.5 A5:0.5",
    13: "G5:1.5 F#5:0.5 E5:1 B4:0.5 -:0.5",
    14: "A4:0.5 C#5:0.5 E5:1.5 C#5:0.5 A4:0.5 -:0.5",
    15: "B4:1 D5:0.5 F#5:1.5 E5:0.5 D5:0.5",
    16: "D5:1.5 B4:0.5 A4:1 F#4:0.5 G4:0.5",
    17: "A4:2 -:0.5 C#5:0.5 E5:0.5 G5:0.5",
    18: "F#5:1 E5:0.5 C#5:0.5 D#5:1 F#5:0.5 A5:0.5",
    19: "G5:1.5 E5:0.5 C#5:1 A4:0.5 -:0.5",
    20: "B4:0.5 D5:0.5 F#5:2 E5:0.5 D5:0.5",
    21: "C#5:1 E5:0.5 F#5:0.5 E5:1.5 -:0.5",
    22: "A5:1.5 F#5:0.5 E5:1 C#5:0.5 E5:0.5",
    23: "D5:2.5 C#5:0.5 B4:0.5 A4:0.5",
    24: "G4:0.5 B4:0.5 E5:1.5 F#5:0.5 G5:1",
    25: "A#4:1 C#5:0.5 E5:0.5 F#5:1.5 -:0.5",
    26: "B5:1.5 A5:0.5 F#5:1 D5:0.5 C#5:0.5",
    27: "D5:1 Bb4:0.5 G4:0.5 E5:1 C#5:1",
    36: "-:1 A4:0.5 D5:0.5 E5:2",
    37: "D5:1 B4:0.5 A4:0.5 F#4:2",
    38: "Bb4:2 A4:1 G4:1",
    39: "F#4:4",
}

SOLO = {  # clean electric guitar: the theme's climb, ornamented an octave up
    28: "F#5:0.5 A5:0.5 C#6:1 A5:0.5 F#5:0.25 E5:0.25 D5:1",
    29: "-:0.5 E5:0.5 G5:0.5 B5:0.5 D6:1.5 B5:0.5",
    30: "C#6:1 A5:0.5 E5:0.5 F#5:0.75 E5:0.25 C#5:1",
    31: "D5:0.5 F#5:0.5 B5:1.5 A5:0.25 G5:0.25 F#5:1",
    32: "-:0.5 F#5:0.5 B5:0.5 D6:0.5 E6:1 D6:0.5 B5:0.5",
    33: "C#6:1.5 A#5:0.5 F#5:0.5 E5:0.5 C#5:1",
    34: "D5:0.5 G5:0.5 Bb5:1.5 A5:0.25 G5:0.25 E5:1",
    35: "D5:2 C#5:1.5 -:0.5",
}

CELLO = {  # an inner answer in A2, then held roots under B and the peak
    12: "D3:2 F#3:1 A3:1", 13: "G3:3 F#3:0.5 E3:0.5", 14: "F#3:2 C#3:1 E3:1", 15: "D3:2 F#3:1 B2:1",
    16: "G3:2 D3:1 B2:1", 17: "G3:2 A3:1 B3:1", 18: "C#3:2 D#3:2", 19: "E3:2 C#3:2",
    20: "G2:4", 21: "A2:4", 22: "F#2:4", 23: "B2:4", 24: "E2:4", 25: "F#2:4", 26: "B2:4", 27: "G2:2 A2:2",
    28: "D2:4", 29: "E2:4", 30: "F#2:4", 31: "G2:4", 32: "B2:4", 33: "F#2:4", 34: "G2:4", 35: "A2:4",
}

PIANO = {  # a few high answers in the melody's rests
    1: "-:2 A5:0.5 F#5:0.5 E5:1", 3: "-:2.5 E5:0.5 C#5:0.5 A4:0.5", 7: "-:2.5 F#5:0.5 D5:0.5 B4:0.5",
    11: "-:2 A5:0.5 G5:0.5 E5:0.5 C#5:0.5", 23: "-:2.5 F#5:0.5 A5:0.5 B5:0.5", 37: "-:2 A5:1 F#5:1",
}

# String pad loudness per bar: silent until A1's second half, fullest at the peak.
STRINGS = [0] * 8 + [34] * 4 + [40] * 8 + [48, 50, 52, 52, 54, 56, 54, 50] + [58] * 7 + [52] + [0, 0, 0, 34]

TEMPOS = [72, 74, 75, 72,
          76, 77, 77, 75, 76, 77, 76, 73,
          76, 77, 78, 76, 77, 78, 76, 73,
          78, 79, 79, 77, 78, 79, 77, 72,
          78, 79, 80, 78, 79, 79, 76, 70,
          72, 70, 66, 58]


def up(note: str) -> str:
    return note[:-1] + str(int(note[-1]) + 1)


def last_balloon() -> Sketch:
    s = Sketch("04-last-balloon", "Last Balloon", TEMPOS, 404, HERE)
    s.part(0, "Nylon guitar melody", 24, 96, 60, 30)
    s.part(1, "Fingerpicked guitar", 25, 78, 70, 26)
    s.part(2, "Strings", 49, 70, 48, 40)
    s.part(3, "Cello", 42, 74, 56, 34)
    s.part(4, "Piano", 0, 62, 74, 32)
    s.part(5, "Clean electric lead", 27, 88, 62, 38)
    for bar, (chords, shape) in enumerate(BARS):
        loud = 50 if bar < 20 else 54 if bar < 36 else 46
        for i, (start, name) in enumerate(chords):
            end = chords[i + 1][0] if i + 1 < len(chords) else 4
            strings = VOICING[name].split()
            for beat, string, ring in PICK[shape]:
                if beat < end - start:
                    s.note(1, bar * 4 + start + beat, strings[string], ring, loud - 3 * string)
            if STRINGS[bar]:
                s.chord(2, bar, start, " ".join(up(n) for n in strings[2:]), end - start - 0.1, STRINGS[bar], 0.03)
    for parts, channel, velocity in [(THEME, 0, 66), (SOLO, 5, 72), (CELLO, 3, 52), (PIANO, 4, 46)]:
        for bar, line in parts.items():
            s.line(channel, bar, line, velocity + (6 if channel == 0 and 20 <= bar < 28 else 0))
    return s


def main():
    args = render_args()
    tracks = [render(last_balloon(), args, "Hanged - second listen")]
    (HERE / "tracks.json").write_text(json.dumps(tracks, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
