"""Versus music: the three competitive loops the app plays during matches.

Unlike the solo tracks, these are seamless loops at a steady tempo (a match
must never hit a cadence and a silence). Rhythm parts are written per bar on a
16-step grid, melodies note by note; every bar names its own patterns, so no
beat repeats as a loop. Reuses first-listen's Sketch and renderer.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "first-listen"))
from compose import Sketch, master, midi_note, render_args, synthesize  # noqa: E402

ALBUM = "Hanged - versus listen"
RATE = 48000
STEP = 0.25           # one grid step: a 16th note
PRE = POST = 2        # bars rendered before and after the loop, so its cut carries the wrap's tails
WRAP = 2880           # 60 ms: the loop's head is crossfaded from the audio that really follows its end
VEL = {"X": 100, "x": 78, "o": 46}
# General MIDI drum notes, by lane letter.
DRUM = {"K": "C2", "R": "C#2", "S": "D2", "F": "F2", "H": "F#2", "f": "G2", "m": "B2", "O": "A#2",
        "t": "D3", "C": "C#3", "Y": "D#3", "T": "F#3", "W": "E5", "w": "F5"}


def up(note: str) -> str:
    return note[:-1] + str(int(note[-1]) + 1)


def shift(line: str, octaves: int) -> str:
    """A melody line moved by whole octaves."""
    def move(token: str) -> str:
        pitch, duration = token.split(":")
        return token if pitch == "-" else f"{pitch[:-1]}{int(pitch[-1]) + octaves}:{duration}"
    return " ".join(move(t) for t in line.split())


def chord(bass: str, arp: str, pad: str) -> dict:
    """Palettes a grid indexes by digit: bass is root, fifth, octave, colour note."""
    b = bass.split()
    timp = [n if midi_note(n) >= midi_note("D2") else up(n) for n in b[:2]]
    return {"bass": bass, "arp": arp, "pad": pad, "power": f"{up(b[0])} {up(b[1])}", "timp": " ".join(timp), "oct": f"{b[0]} {b[2]}"}


def steps(pattern: str):
    """(step, token, length in steps) of each struck step; '-' holds, '.' rests."""
    assert len(pattern) == 16, pattern
    for i, token in enumerate(pattern):
        if token not in ".-":
            n = 1
            while i + n < 16 and pattern[i + n] == "-":
                n += 1
            yield i, token, n


def play_line(s: Sketch, channel: int, pos: int, line: str, spans, chords, velocity: int = 66):
    assert abs(sum(float(t.split(":")[1]) for t in line.split()) - 4) < 1e-9, line
    s.line(channel, pos, line, velocity)


def play_grid(s: Sketch, channel: int, pos: int, pattern: str, spans, chords, palette: str, velocity: int, gate: float):
    # Digits index the bar's chord palette, 'c' strikes all of it.
    for step, token, length in steps(pattern):
        beat = step * STEP
        name = next(n for a, b, n in spans if a <= beat < b)
        notes = chords[name][palette].split()
        accent = 6 if step % 4 == 0 else 0 if step % 2 == 0 else -5
        for note in notes if token == "c" else [notes[int(token)]]:
            s.note(channel, pos * 4 + beat, note, length * STEP * (gate if length == 1 else .95), velocity + accent)


def play_pad(s: Sketch, channel: int, pos: int, velocity: int, spans, chords, palette: str = "pad"):
    for a, b, name in spans:
        s.chord(channel, pos, a, chords[name][palette], b - a - .08, velocity, .02)


def play_drums(s: Sketch, channel: int, pos: int, lanes: dict, spans, chords):
    for lane, pattern in lanes.items():
        for step, token, _ in steps(pattern):
            s.note(channel, pos * 4 + step * STEP, DRUM[lane], .2, VEL[token])


KINDS = {"line": play_line, "grid": play_grid, "pad": play_pad, "drums": play_drums}


class Loop:
    """A loop written once and rendered after a pre-roll of its own last bars,
    then followed by its first bars, so both ends of the cut ring true."""

    def __init__(self, slug: str, title: str, bpm: int, seed: int, chords: dict, grooves: dict, parts: list, layers: dict):
        self.slug, self.title, self.bpm, self.seed = slug, title, bpm, seed
        self.chords, self.grooves, self.parts, self.layers = chords, grooves, parts, layers
        self.bars: list[dict] = []

    def section(self, chords: str, **layers):
        """Bars of chords ('Gm7|C7' splits a bar); a list value cycles one item per bar."""
        start = len(self.bars)
        for i, ch in enumerate(chords.split()):
            self.bars.append({"ch": ch, **{k: v[i % len(v)] if isinstance(v, list) else v for k, v in layers.items()}})
        return start

    def lines(self, key: str, start: int, written: list[str]):
        for i, line in enumerate(written):
            self.bars[start + i][key] = line

    def drums(self, name: str) -> dict:
        lanes: dict[str, str] = {}
        for part in name.split("+"):
            for lane, pattern in self.grooves[part].items():
                old = lanes.get(lane, "." * 16)
                lanes[lane] = "".join(n if n != "." else o for o, n in zip(old, pattern))
        return lanes

    def play(self, s: Sketch, pos: int, bar: dict):
        names = bar["ch"].split("|")
        spans = [(4 * i / len(names), 4 * (i + 1) / len(names), n) for i, n in enumerate(names)]
        for key, value in bar.items():
            if key != "ch" and value:
                kind, channel, *options = self.layers[key]
                KINDS[kind](s, channel, pos, self.drums(value) if kind == "drums" else value, spans, self.chords, *options)

    def sketch(self) -> tuple[Sketch, int, int]:
        """The sketch to render and the loop's first sample and length in samples."""
        n = len(self.bars)
        order = [*range(n - PRE, n), *range(n), *range(POST)]
        s = Sketch(self.slug, self.title, [self.bpm] * len(order), self.seed, HERE)
        for part in self.parts:
            s.part(*part)
        for pos, bar in enumerate(order):
            s.rng.seed(self.seed * 1000 + bar)  # a bar sounds the same wherever it is played
            self.play(s, pos, self.bars[bar])
        bar_seconds = 4 * 60 / self.bpm
        return s, round(PRE * bar_seconds * RATE), round(n * bar_seconds * RATE)


# ---------------------------------------------------------------- Photo Finish

PF_CHORDS = {
    "Em": chord("E2 B2 E3 D3", "E4 G4 B4 D5 E5 G5", "G3 B3 E4"),
    "Em/D": chord("D2 B2 D3 E3", "E4 G4 B4 D5 E5 G5", "G3 B3 E4"),
    "C": chord("C2 G2 C3 B2", "E4 G4 C5 D5 E5 G5", "G3 C4 E4"),
    "Cmaj7": chord("C2 G2 C3 B2", "E4 G4 B4 C5 E5 G5", "G3 B3 E4"),
    "D": chord("D2 A2 D3 C3", "F#4 A4 D5 E5 F#5 A5", "F#3 A3 D4"),
    "D/F#": chord("F#2 A2 D3 F#3", "F#4 A4 D5 E5 F#5 A5", "F#3 A3 D4"),
    "G": chord("G2 D3 G3 F#3", "G4 B4 D5 E5 G5 B5", "G3 B3 D4"),
    "Am7": chord("A2 E3 A3 G3", "E4 G4 A4 C5 E5 G5", "G3 C4 E4"),
    "B7sus4": chord("B1 F#2 B2 A2", "F#4 A4 B4 E5 F#5 A5", "F#3 A3 E4"),
    "B7": chord("B1 F#2 B2 A2", "F#4 A4 B4 D#5 F#5 A5", "F#3 A3 D#4"),
}

PF_GROOVES = {
    "intro0": {"K": "x...............", "H": "x.o.x.o.x.o.x.o."},
    "intro1": {"K": "x.......x.......", "H": "x.o.x.o.x.o.x.o."},
    "intro2": {"K": "x...x...x...x...", "H": "xoxoxoxoxoxoxoxo"},
    "drive": {"K": "x.......x.x.....", "S": "....X.......X...", "H": "x.o.x.o.x.o.x.o."},
    "drive2": {"K": "x.....x...x.....", "S": "....X.......X..o", "H": "x.o.x.oxx.o.x.o."},
    "push": {"K": "x..x..x...x..x..", "S": "....X.......X...", "H": "xoxoxoxoxoxoxoxo"},
    "gallop": {"K": "x.x...x.x.x...x.", "S": "....X.......X...", "O": "..............x."},
    "tick": {"K": "x.......x.......", "W": "x.......x.......", "w": "....x.......x..."},
    "build": {"K": "x...x...x...x...", "S": "o.o.o.o.x.x.x.x.", "W": "x.......x......."},
    "roll": {"K": "x...x...x...x...", "S": "ooooxxxxxxxxXXXX"},
    "fill1": {"K": "x.....x.........", "S": "....X.......XoXo", "H": "x.o.x.o.x.o....."},
    "fill3": {"K": "x...x...x...x...", "S": "XoxoXoxoXxXxXXXX"},
    "fillTom": {"K": "x.........x.....", "t": "XxXx............", "m": "....XxXx........", "f": "........XxXx....", "F": "............XXXX"},
    "crash": {"C": "X..............."},
}

PF_RIFF = [  # brass stabs over the A section's chords
    "E4:0.5 -:0.25 E4:0.25 G4:0.5 A4:0.5 B4:0.75 A4:0.25 G4:0.5 -:0.5",
    "-:0.5 B4:0.25 D5:0.25 E5:0.5 D5:0.5 B4:1 -:1",
    "E5:0.5 -:0.25 E5:0.25 D5:0.5 B4:0.5 C5:0.75 B4:0.25 G4:0.5 -:0.5",
    "F#4:0.5 A4:0.5 D5:0.5 -:0.5 C5:0.5 A4:0.5 F#4:0.5 -:0.5",
    "E4:0.5 -:0.25 E4:0.25 G4:0.5 A4:0.5 B4:0.75 D5:0.25 E5:0.5 -:0.5",
    "-:0.5 G5:0.25 F#5:0.25 E5:0.5 D5:0.5 E5:1 -:1",
    "C5:0.5 -:0.25 C5:0.25 B4:0.5 A4:0.5 E5:0.75 C5:0.25 A4:0.5 -:0.5",
    "D#5:0.75 F#5:0.75 A5:0.5 -:0.5 F#5:0.25 D#5:0.25 B4:1",
]

PF_THEME = [  # C D Em Em/D C D B7sus4 B7 | C D G D/F# Em C Am7 B7
    "E5:1 D5:0.5 E5:0.5 G5:1 E5:0.5 D5:0.5",
    "F#5:1.5 E5:0.5 D5:1 A4:1",
    "B4:0.5 D5:0.5 E5:1.5 B4:0.5 G4:0.5 A4:0.5",
    "B4:3 -:1",
    "E5:1 D5:0.5 E5:0.5 G5:1 A5:0.5 G5:0.5",
    "F#5:1 A5:1 D5:1.5 E5:0.5",
    "E5:1.5 F#5:0.5 A5:0.5 F#5:0.5 E5:1",
    "D#5:3 -:1",
    "G5:1 F#5:0.5 E5:0.5 C5:1 E5:1",
    "F#5:1 E5:0.5 D5:0.5 A4:1.5 D5:0.5",
    "B5:1.5 A5:0.5 G5:1 D5:1",
    "A5:1.5 G5:0.5 F#5:1 D5:1",
    "E5:1 G5:0.5 B5:1.5 A5:0.5 G5:0.5",
    "E5:1.5 D5:0.5 C5:1 G4:1",
    "A4:0.5 C5:0.5 E5:1 G5:1 E5:1",
    "F#5:2 D#5:1 B4:1",
]


def photo_finish() -> Loop:
    """Word Rush: a race against the clock. E minor, 150 BPM."""
    L = Loop("05-photo-finish", "Photo Finish", 150, 505, PF_CHORDS, PF_GROOVES, [
        (0, "Brass section", 61, 90, 60, 30), (1, "Trumpet", 56, 80, 70, 32), (2, "Muted guitar", 28, 78, 38, 14),
        (3, "Pizzicato strings", 45, 80, 88, 26), (4, "Picked bass", 34, 98, 64, 8), (5, "French horns", 60, 74, 50, 36),
        (6, "Tremolo strings", 44, 64, 78, 40), (7, "Timpani", 47, 84, 58, 30), (9, "Drums", 0, 96, 64, 16),
    ], {
        "lead": ("line", 0, 68), "lead2": ("line", 0, 76), "tpt": ("line", 1, 72), "horn": ("line", 5, 60), "hornpad": ("pad", 5),
        "trem": ("pad", 6), "gtr": ("grid", 2, "power", 64, .45), "pizz": ("grid", 3, "arp", 58, .5),
        "bass": ("grid", 4, "bass", 74, .7), "timp": ("grid", 7, "timp", 70, .9), "dr": ("drums", 9),
    })
    # Intro: the pack lines up. After the loop's climax it is also the breath before lap two.
    L.section("Em Em C D", gtr=["c.......c.......", "c.......c.......", "c.c.c.c.c.c.c.c.", "c.cc.cc.c.cc.cc."],
              bass=["0...............", "0.......0.......", "0.0.0.0.0.0.2.1.", "0.0.0.2.0.0.1.3."],
              timp=["0...............", "0...............", "0.......1.......", "0...0...0.0.0000"],
              dr=["intro0", "intro1", "intro2", "fillTom"], hornpad=[0, 0, 50, 56])
    # A: the riff, then brass and horns trading.
    a = L.section("Em Em Cmaj7 D Em Em Am7 B7 Em Em Cmaj7 D Em Em Am7 B7",
                  gtr=["c.c.c.c.c.c.c.c.", "c.cc.cc.c.cc.cc.", "c.c.c.c.c.c.c.c.", "c..c..c.c..c..c."],
                  pizz=["0.2.1.3.2.4.3.2.", "0.2.4.2.1.3.5.3.", "0.2.1.3.2.4.3.2.", "4.3.2.0.4.3.2.1."],
                  bass=["0.0.0.0.0.0.2.1.", "0.0.0.2.0.0.1.3.", "0.0.0.0.0.0.2.1.", "0.00.00.0.00.00."],
                  dr=["drive+crash", "drive", "drive2", "drive", "drive", "drive2", "drive", "fill1",
                      "drive+crash", "drive", "drive2", "drive", "push", "push", "drive2", "fill3"],
                  hornpad=[58] * 8 + [0] * 8, trem=[0] * 8 + [44] * 8)
    L.lines("lead", a, PF_RIFF + [PF_RIFF[0], "", PF_RIFF[2], "", PF_RIFF[4], "", PF_RIFF[6], PF_RIFF[7]])
    L.lines("horn", a + 9, ["-:0.5 B3:0.5 D4:1 E4:1.5 -:0.5", "", "-:0.5 A3:0.5 D4:1 F#4:1.5 -:0.5", "", "-:0.5 G4:0.5 F#4:1 E4:1.5 -:0.5"])
    # B: the theme.
    b = L.section("C D Em Em/D C D B7sus4 B7 C D G D/F# Em C Am7 B7",
                  gtr=["c.c.c.c.c.c.c.c.", "c.c.c.c.c.c.c.c.", "c.cc.cc.c.cc.cc.", "c.c.c.c.c.c.c.c."],
                  pizz=["0.1.2.3.4.5.4.3.", "0.2.4.2.1.3.5.3.", "0.2.1.3.2.4.3.2.", "4.3.2.0.4.3.2.1."],
                  bass=["0.0.0.0.0.0.2.1.", "0.0.0.2.0.0.1.3.", "0.0.0.0.0.0.2.1.", "0.00.00.0.00.00."],
                  dr=["drive+crash", "drive", "drive2", "drive", "drive", "drive2", "gallop", "fill1",
                      "drive+crash", "drive", "drive2", "drive", "push", "drive2", "gallop", "fillTom"],
                  hornpad=50)
    L.lines("lead", b, PF_THEME)
    # Breakdown: the clock ticks, then the snare winds everyone back up.
    d = L.section("Em Em C C Am7 Am7 B7sus4 B7",
                  gtr=["", "", "", "", "c..c..c.c..c..c.", "c..c..c.c..c..c.", "c.c.c.c.c.c.c.c.", "cccccccccccccccc"],
                  pizz=["0..2..4.1..3..5.", "", "0..2..4.1..3..5.", "", "0..2..4.1..3..5.", "0..2..4.1..3..5.", "0.2.1.3.2.4.3.2.", "0212031202130212"],
                  bass=["0---------------", "0---------------", "0-------1-------", "0-------1-------", "0---------------", "0---------------", "0.0.0.0.0.0.2.1.", "0.0.0.0.0.0.2.1."],
                  timp=["0...............", "", "0...............", "", "0...............", "", "0...0...0.0.0000", "0000000000000000"],
                  dr=["tick", "tick", "tick", "tick", "tick", "tick", "build", "roll"], trem=50)
    L.lines("horn", d, ["B3:2 E4:2", "G4:3 F#4:1", "E4:2 G4:2", "C5:3 B4:1", "A4:2 C5:1 B4:1", "A4:2 E4:2", "F#4:2 A4:2", "B4:2 D#5:2"])
    # A': the riff returns over 16th-note strings and runs up into the climax.
    a2 = L.section("Em Em Cmaj7 D Em Em Am7 B7",
                   gtr=["c.cc.cc.c.cc.cc.", "c.c.c.c.c.c.c.c."], pizz=["0212031202130212", "5342534253425321"],
                   bass=["0.00.00.0.00.00.", "0.0.0.2.0.0.1.3."], hornpad=60,
                   dr=["drive+crash", "drive2", "push", "drive", "drive", "drive2", "push", "fill3"])
    L.lines("lead", a2, PF_RIFF[:7] + ["D#5:0.5 F#5:0.5 A5:0.5 B5:0.5 A5:0.5 F#5:0.5 D#5:0.5 B4:0.5"])
    # Climax: the theme on brass and trumpet, horns an octave below.
    c = L.section("C D Em Em/D C D B7sus4 B7 C D G D/F# Em C Am7 B7",
                  gtr=["c.cc.cc.c.cc.cc.", "cccccccccccccccc", "c.cc.cc.c.cc.cc.", "c.c.c.c.c.c.cccc"],
                  pizz=["0212031202130212", "5342534253425321"],
                  bass=["0.2.0.2.0.2.1.3.", "0.0.0.2.0.0.1.3.", "0.2.0.2.0.2.1.3.", "0.00.00.0.00.00."],
                  timp=["0.......1......."], trem=56,
                  dr=["push+crash", "push", "drive2", "push", "push", "push", "gallop", "fill1",
                      "push+crash", "push", "drive2", "push", "push", "push", "gallop", "fillTom"])
    finale = PF_THEME[:14] + ["A4:0.5 C5:0.5 E5:0.5 G5:0.5 A5:1 C6:1", "B5:1.5 A5:0.5 F#5:1 D#5:1"]
    L.lines("lead2", c, finale)
    L.lines("tpt", c, finale)
    L.lines("horn", c, [shift(line, -1) for line in finale])
    # Turnaround: stabs, then the toms hand back to the intro.
    t = L.section("C D B7sus4 B7", gtr=["c.c.c.c.c.c.c.c.", "c.c.c.c.c.c.c.c.", "c.c.c.c.c.c.cccc", "cccccccccccccccc"],
                  bass=["0.0.0.0.0.0.2.1.", "0.0.0.0.0.0.2.1.", "0.2.0.2.0.2.1.3.", "0.0.0.0.0.0.2.1."],
                  timp=["0.......1.......", "0.......1.......", "0...0...0.0.0000", "0000000000000000"],
                  dr=["drive+crash", "drive2", "fill3", "fillTom"], hornpad=58)
    L.lines("lead", t, ["C5:0.5 -:0.5 C5:0.5 -:0.5 E5:0.5 -:0.5 G5:1", "D5:0.5 -:0.5 D5:0.5 -:0.5 F#5:0.5 -:0.5 A5:1",
                        "B4:0.5 E5:0.5 F#5:0.5 B5:1.5 -:1", "A5:0.5 F#5:0.5 D#5:0.5 B4:0.5 -:2"])
    return L


# ----------------------------------------------------------------- Pop Rivals

PR_CHORDS = {
    "F6": chord("F2 C3 F3 A2", "A4 C5 D5 F5 A5 C6", "A3 C4 D4 F4"),
    "D7": chord("D2 A2 D3 F#2", "F#4 A4 C5 D5 F#5 A5", "A3 C4 F#4"),
    "Gm7": chord("G2 D3 G3 Bb2", "Bb4 D5 F5 G5 Bb5 D6", "Bb3 D4 F4"),
    "C7": chord("C2 G2 C3 E2", "Bb4 C5 E5 G5 Bb5 C6", "Bb3 E4 G4"),
    "Am7": chord("A2 E3 A3 C3", "G4 A4 C5 E5 G5 A5", "G3 C4 E4"),
    "F7": chord("F2 C3 F3 A2", "A4 C5 Eb5 F5 A5 C6", "A3 Eb4 F4"),
    "Bb6": chord("Bb1 F2 Bb2 D2", "F4 G4 Bb4 D5 F5 G5", "D4 F4 G4"),
    "Bdim7": chord("B1 F2 B2 D2", "F4 Ab4 B4 D5 F5 Ab5", "D4 F4 Ab4"),
    "F/C": chord("C2 G2 C3 A2", "F4 A4 C5 F5 A5 C6", "A3 C4 F4"),
    "Dm": chord("D2 A2 D3 F2", "D4 F4 A4 D5 F5 A5", "D4 F4 A4"),
    "Bb": chord("Bb1 F2 Bb2 D2", "D4 F4 Bb4 D5 F5 Bb5", "D4 F4 Bb4"),
    "Gm": chord("G2 D3 G3 Bb2", "D4 G4 Bb4 D5 G5 Bb5", "D4 G4 Bb4"),
    "A7": chord("A1 E2 A2 C#2", "C#4 E4 G4 A4 C#5 E5", "C#4 E4 G4"),
    "A7sus4": chord("A1 E2 A2 D2", "D4 E4 G4 A4 D5 E5", "D4 E4 G4"),
    "E7": chord("E2 B2 E3 G#2", "D4 E4 G#4 B4 D5 E5", "D4 G#4 B4"),
}

PR_GROOVES = {
    "rim": {"K": "x.......x.......", "R": "....x.......x...", "H": "x...x...x...x..."},
    "rim2": {"K": "x.....x.........", "R": "....x..x....x...", "H": "..x...x...x...x."},
    "bounce": {"K": "x.....x.x.......", "S": "....X.......X...", "H": "x.x.x.x.x.x.x.x."},
    "bounce2": {"K": "x.......x.x.....", "S": "....X..o....X.o.", "H": "x.xox.x.x.xox.x."},
    "bounceT": {"K": "x.....x.x.......", "S": "....X.......X...", "H": "x.o.x.o.x.o.x.o.", "T": "....x.......x..."},
    "chase": {"K": "x.x...x.x.x...x.", "S": "....X.......X...", "H": "xoxoxoxoxoxoxoxo"},
    "chase2": {"K": "x...x.x...x.x...", "S": "....X..o.o..X...", "H": "xoxoxoxoxoxoxoxo"},
    "pop": {"K": "..............X.", "C": "..............X."},  # a balloon pops on the last 'and'
    "fillS": {"K": "x.......x.......", "S": "....X...XoXoXXXX"},
    "fillT": {"K": "x...............", "S": "....X...........", "t": "........XX......", "m": "..........XX....", "f": "............XX..", "F": "..............XX"},
    "crash": {"C": "X..............."},
}

# Call and answer: the muted trumpet (left) and the clarinet (right) are the two rivals.
PR_A = [  # F6 D7 Gm7 C7 Am7 D7 Gm7 C7 F6 F7 Bb6 Bdim7 F/C D7 Gm7|C7 F6, as (trumpet, clarinet)
    ("C5:0.5 -:0.25 A4:0.25 C5:0.5 D5:0.5 F5:0.75 D5:0.25 C5:0.5 -:0.5", ""),
    ("F#5:0.5 -:0.25 F#5:0.25 A5:0.5 F#5:0.5 D5:1 -:1", ""),
    ("", "-:0.5 D5:0.25 C5:0.25 Bb4:0.5 G4:0.5 A4:0.25 Bb4:0.25 D5:0.5 F5:0.5 -:0.5"),
    ("", "E5:0.75 D5:0.25 C5:0.5 Bb4:0.5 G4:0.5 E4:0.5 C4:0.5 -:0.5"),
    ("E5:0.5 -:0.25 C5:0.25 E5:0.5 G5:0.5 A5:0.75 G5:0.25 E5:0.5 -:0.5", ""),
    ("F#5:0.5 E5:0.5 D5:0.5 C5:0.5 A4:1 -:1", ""),
    ("", "-:0.5 Bb4:0.5 D5:0.5 F5:0.5 A5:0.75 G5:0.25 F5:0.5 -:0.5"),
    ("", "E5:0.5 G5:0.5 Bb5:0.5 -:0.5 A5:0.25 G5:0.25 E5:0.5 C5:1"),
    ("A5:0.75 G5:0.25 F5:0.5 D5:0.5 C5:0.5 A4:0.5 C5:1", ""),
    ("-:0.5 Eb5:0.5 C5:0.5 A4:0.5 F4:0.5 A4:0.5 C5:0.5 Eb5:0.5", ""),
    ("", "D5:0.75 F5:0.25 G5:0.5 F5:0.5 D5:0.5 Bb4:0.5 G4:1"),
    ("", "Ab4:0.5 B4:0.5 D5:0.5 F5:0.5 Ab5:1.5 -:0.5"),
    ("A5:1 G5:0.5 F5:0.5 C5:1 A4:1", "F5:1 E5:0.5 D5:0.5 A4:1 F4:1"),
    ("F#5:0.5 G5:0.5 A5:0.5 C6:0.5 Bb5:0.5 A5:0.5 F#5:1", "D5:0.5 E5:0.5 F#5:0.5 A5:0.5 G5:0.5 F#5:0.5 D5:1"),
    ("G5:1 F5:0.5 D5:0.5 E5:1 G5:1", "Bb4:1 A4:0.5 Bb4:0.5 C5:1 E5:1"),
    ("F5:0.5 -:0.5 A5:0.5 F5:0.5 -:2", "C5:0.5 -:0.5 F5:0.5 D5:0.5 -:2"),
]

PR_BASS_A = ["0.....1.2...1...", "0..2..1.0...3.1.", "0.....1.2...1...", "0.2.1.2.0.2.1.3."]
PR_CLAV = ["..c...c...c...c.", "..c..c....c..c.c", "..c...c...c...c.", "c..c..c...c.c..."]


def pop_rivals() -> Loop:
    """Balloon Battle: two rivals trading phrases. F major, 132 BPM."""
    L = Loop("06-pop-rivals", "Pop Rivals", 132, 606, PR_CHORDS, PR_GROOVES, [
        (0, "Muted trumpet", 59, 94, 40, 26), (1, "Clarinet", 71, 92, 88, 26), (2, "Clavinet", 7, 66, 64, 18),
        (3, "Finger bass", 33, 98, 64, 8), (4, "Xylophone", 13, 70, 72, 30), (5, "Pizzicato strings", 45, 78, 54, 24),
        (6, "Brass section", 61, 84, 64, 28), (9, "Drums", 0, 92, 64, 16),
    ], {
        "p1": ("line", 0, 70), "p2": ("line", 1, 68), "clav": ("grid", 2, "pad", 56, .3), "bass": ("grid", 3, "bass", 76, .55),
        "walk": ("line", 3, 74), "walksoft": ("line", 3, 62), "xylo": ("line", 4, 62), "pizz": ("line", 5, 62), "pgrid": ("grid", 5, "arp", 54, .5),
        "stab": ("grid", 6, "pad", 72, .35), "dr": ("drums", 9),
    })
    # Intro: tiptoeing in.
    i = L.section("F6 D7 Gm7 C7", dr=["rim", "rim2", "rim", "fillS"],
                  pgrid=["0...2...1...3...", "0.2...1.3...2...", "0...2...1...3...", "0.2...1.3...2..."])
    L.lines("walksoft", i, ["F2:1 A2:1 C3:1 D3:1", "D3:1 C3:1 A2:1 F#2:1", "G2:1 Bb2:1 D3:1 F3:1", "E3:1 C3:1 Bb2:1 G2:1"])
    L.lines("xylo", i + 3, ["-:2 C6:0.25 Bb5:0.25 G5:0.25 E5:0.25 C5:0.5 -:0.5"])
    # A: the rivals take turns, then argue together.
    a = L.section("F6 D7 Gm7 C7 Am7 D7 Gm7 C7 F6 F7 Bb6 Bdim7 F/C D7 Gm7|C7 F6", bass=PR_BASS_A, clav=PR_CLAV,
                  dr=["bounce+crash", "bounce", "bounce2", "bounce", "bounce", "bounce2", "bounce", "fillS",
                      "bounce+crash", "bounce", "bounce2", "bounce", "bounceT", "bounceT", "bounce2", "bounce"])
    L.lines("p1", a, [t for t, _ in PR_A])
    L.lines("p2", a, [c for _, c in PR_A])
    L.bars[a + 15]["stab"] = "........c.c....."
    # B: tug of war, the two lines pulling in opposite directions over a walking bass.
    b = L.section("Bb6 Bdim7 F/C D7 Gm7 C7 Am7|D7 Gm7|C7", clav=["c..c..c...c.c...", "..c.c...c.c...c."],
                  dr=["bounceT+crash", "bounceT", "bounce2", "bounceT", "bounceT", "bounce2", "bounceT", "fillT"])
    L.lines("walk", b, ["Bb1:1 D2:1 F2:1 G2:1", "B1:1 D2:1 F2:1 Ab2:1", "C2:1 F2:1 A2:1 C3:1", "D3:1 A2:1 F#2:1 D2:1",
                        "G2:1 A2:1 Bb2:1 D3:1", "C3:1 Bb2:1 G2:1 E2:1", "A2:1 E2:1 D2:1 F#2:1", "G2:1 Bb2:1 C3:1 E2:1"])
    L.lines("p1", b, ["D5:1.5 F5:0.5 G5:1 F5:1", "Ab5:1.5 F5:0.5 D5:1 B4:1", "C5:1 F5:1 A5:1.5 G5:0.5", "F#5:1.5 E5:0.5 D5:1 C5:1",
                      "Bb4:1 D5:1 G5:1.5 F5:0.5", "E5:1.5 G5:0.5 Bb5:2", "C6:1 A5:1 A5:0.5 F#5:0.5 D5:1", "Bb5:1 G5:1 E5:1 -:1"])
    L.lines("p2", b, ["F4:1 G4:1 Bb4:1 D5:1", "B4:1 D5:1 F5:1 Ab5:1", "A5:1 F5:1 C5:1.5 D5:0.5", "D5:1 F#5:1 A5:1 C6:1",
                      "G5:1 D5:1 Bb4:1.5 A4:0.5", "C5:1.5 Bb4:0.5 G4:2", "E5:1 G5:1 C5:0.5 D5:0.5 F#5:1", "D5:1 F5:1 G5:1 -:1"])
    # Chase: D minor, one bar each, the xylophone popping in between.
    c = L.section("Dm Bb Gm A7 Dm Bb E7 A7", bass="0.2.1.2.0.2.1.3.", clav="c..c..c...c.c...", pgrid=["0.1.2.3.4.5.4.3.", "5.4.3.2.1.0.1.2."],
                  dr=["chase+crash", "chase2", "chase", "chase2", "chase", "chase2", "chase", "fillS"])
    L.lines("p1", c, ["D5:0.25 E5:0.25 F5:0.25 A5:0.25 D6:0.5 -:0.5 A5:0.5 F5:0.5 D5:0.5 -:0.5", "",
                      "G5:0.5 Bb5:0.5 D5:0.5 G5:0.5 F5:0.25 E5:0.25 D5:0.5 Bb4:1", "",
                      "A5:0.75 F5:0.25 D5:0.5 A5:0.5 Bb5:0.5 A5:0.5 F5:1", "",
                      "G#5:0.5 B5:0.5 D6:0.5 B5:0.5 G#5:0.5 E5:0.5 D5:0.5 B4:0.5", "C#6:1 A5:0.5 E5:0.5 -:2"])
    L.lines("p2", c, ["", "D5:0.25 C5:0.25 Bb4:0.25 F4:0.25 D5:0.5 -:0.5 F5:0.5 D5:0.5 Bb4:0.5 -:0.5",
                      "", "C#5:0.5 E5:0.5 G5:0.5 A5:0.5 G5:0.25 E5:0.25 C#5:0.5 A4:1",
                      "", "F5:0.75 D5:0.25 Bb4:0.5 F5:0.5 G5:0.5 F5:0.5 D5:1",
                      "E4:0.5 G#4:0.5 B4:0.5 D5:0.5 E5:0.5 G#5:0.5 B5:0.5 D6:0.5", "A5:1 E5:0.5 C#5:0.5 -:2"])
    L.lines("xylo", c + 1, ["-:3 A6:0.25 F6:0.25 D6:0.5", "", "-:3 B6:0.25 G6:0.25 D6:0.5", "", "-:3 D7:0.25 Bb6:0.25 F6:0.5"])
    L.bars[c + 7]["stab"] = "........c...c..."
    # Breakdown: sneaking up on each other's balloons. Pop!
    d = L.section("Dm Dm Gm Dm Bb Bb A7sus4 A7", bass="0.......0..1....",
                  dr=["rim", "rim+pop", "rim", "rim+pop", "rim", "rim+pop", "rim2", "fillT"],
                  stab=["", "..............c.", "", "..............c.", "", "..............c.", "", ""])
    L.lines("pizz", d, ["D4:0.5 -:0.5 F4:0.5 -:0.5 E4:0.5 -:0.5 D4:0.5 -:0.5", "C#4:0.5 -:0.5 D4:0.5 -:0.5 A3:0.5 -:1.5",
                        "D4:0.5 -:0.5 F4:0.5 -:0.5 G4:0.5 -:0.5 A4:0.5 -:0.5", "Bb4:0.5 -:0.5 A4:0.5 -:0.5 G#4:0.5 A4:0.5 -:1",
                        "D4:0.5 -:0.5 F4:0.5 -:0.5 Bb4:0.5 -:0.5 A4:0.5 -:0.5", "G4:0.5 -:0.5 F4:0.5 -:0.5 D4:0.5 -:1.5",
                        "E4:0.5 -:0.5 A4:0.5 -:0.5 D5:0.5 -:0.5 E5:0.5 -:0.5", "C#5:0.5 E5:0.5 G5:0.5 A5:0.5 -:2"])
    L.lines("p2", d + 4, ["D4:4", "F4:2 D4:2", "E4:4", "C#4:2 E4:2"])
    # A2: the rivals swap their lines, then everyone together with the xylophone on top.
    a2 = L.section("F6 D7 Gm7 C7 Am7 D7 Gm7 C7 F6 F7 Bb6 Bdim7 F/C D7 Gm7|C7 F6", bass=PR_BASS_A[1:] + PR_BASS_A[:1],
                   clav=["..c...c...c...c.", "..c.c...c.c...c.", "..c..c....c..c.c", "c..c..c...c.c..."],
                   dr=["bounceT+crash", "bounce2", "bounceT", "bounce2", "bounceT", "bounce2", "bounceT", "fillS",
                       "chase+crash", "bounceT", "chase2", "bounceT", "chase", "bounceT", "chase2", "fillT"])
    L.lines("p1", a2, [c for _, c in PR_A[:8]] + [t for t, _ in PR_A[8:]])
    L.lines("p2", a2, [t for t, _ in PR_A[:8]] + [c for _, c in PR_A[8:]])
    L.lines("xylo", a2 + 8, [t or c for t, c in PR_A[8:]])
    L.bars[a2 + 15]["stab"] = "........c.c....."
    # Turnaround: both rivals in unison, back to tiptoeing.
    t = L.section("Gm7 C7 Am7|D7 Gm7|C7", clav="..c...c...c...c.", dr=["bounce2", "bounceT", "fillS", "fillT"])
    L.lines("walk", t, ["G2:1 A2:1 Bb2:1 B2:1", "C3:1 G2:1 E2:1 C2:1", "A2:1 C3:1 D3:1 C3:1", "Bb2:1 G2:1 C3:1 E2:1"])
    unison = ["G4:0.5 A4:0.5 Bb4:0.5 B4:0.5 C5:0.5 D5:0.5 E5:0.5 F5:0.5", "G5:1 E5:0.5 C5:0.5 Bb4:1 G4:1",
           "A4:0.5 C5:0.5 E5:0.5 G5:0.5 F#5:0.5 A5:0.5 C6:0.5 A5:0.5", "Bb5:1 G5:0.5 D5:0.5 E5:0.5 -:0.5 C5:0.5 -:0.5"]
    L.lines("p1", t, unison)
    L.lines("p2", t, [shift(line, -1) for line in unison])
    return L


# ------------------------------------------------------------------- Your Move

YM_CHORDS = {
    "Cm": chord("C2 G2 C3 Eb2", "C4 Eb4 G4 C5 D5 Eb5", "Eb3 G3 C4"),
    "Eb/Bb": chord("Bb1 F2 Bb2 Eb2", "Bb3 Eb4 G4 Bb4 C5 Eb5", "Eb3 G3 Bb3"),
    "Abmaj7": chord("Ab1 Eb2 Ab2 C2", "C4 Eb4 G4 Ab4 C5 Eb5", "Eb3 G3 C4"),
    "Db": chord("Db2 Ab2 Db3 F2", "Db4 F4 Ab4 Db5 F5 Ab5", "F3 Ab3 Db4"),
    "Fm9": chord("F2 C3 F3 Ab2", "C4 Eb4 F4 G4 Ab4 C5", "Ab3 C4 Eb4"),
    "Fm7": chord("F2 C3 F3 Ab2", "C4 Eb4 F4 Ab4 C5 Eb5", "Ab3 C4 Eb4"),
    "Fm": chord("F2 C3 F3 Ab2", "C4 F4 Ab4 C5 F5 Ab5", "F3 Ab3 C4"),
    "Gsus4": chord("G2 D3 G3 C3", "C4 D4 G4 C5 D5 G5", "C4 D4 G4"),
    "G7": chord("G2 D3 G3 B2", "B3 D4 F4 G4 B4 D5", "B3 D4 F4"),
    "G7sus4": chord("G2 D3 G3 C3", "C4 D4 F4 G4 C5 D5", "C4 F4 G4"),
    "Ab": chord("Ab1 Eb2 Ab2 C2", "C4 Eb4 Ab4 C5 Eb5 Ab5", "C4 Eb4 Ab4"),
    "Bb": chord("Bb1 F2 Bb2 D2", "D4 F4 Bb4 D5 F5 Bb5", "D4 F4 Bb4"),
    "Gm": chord("G2 D3 G3 Bb2", "D4 G4 Bb4 D5 G5 Bb5", "D4 G4 Bb4"),
}

YM_GROOVES = {
    "tick": {"R": "x...x...x...x..."},
    "tick2": {"K": "x...............", "R": "x...x...x...x..."},
    "pulse": {"K": "x.....x.x.......", "R": "....x.......x...", "H": "o.o.o.o.o.o.o.o."},
    "toms": {"K": "x.....x.........", "f": "x..x..x.........", "m": "........x..x....", "t": "..............x.", "H": "o.o.o.o.o.o.o.o."},
    "drive": {"K": "x..x..x.x..x....", "S": "....X.......X...", "H": "x.o.x.o.x.o.x.o."},
    "drive2": {"K": "x..x..x.x.....x.", "S": "....X.......X.o.", "H": "x.o.x.o.x.o.xoxo"},
    "roll": {"K": "x.......x.......", "S": "ooooxxxxxxxxXXXX"},
    "fillT": {"K": "x...............", "t": "....XxXx........", "m": "........XxXx....", "F": "............XXXX"},
    "crash": {"C": "X..............."},
}

YM_A1 = ["G3:1.5 Ab3:0.5 G3:1 Eb3:1", "C4:1.5 D4:0.5 Eb4:1 D4:0.5 C4:0.5", "G4:2 Eb4:1 C4:1", "Ab4:1.5 G4:0.5 Eb4:2",
         "F4:1 Ab4:0.5 G4:0.5 F4:1 Eb4:0.5 C4:0.5", "G4:2 -:0.5 F4:0.5 Eb4:0.5 D4:0.5", "C4:2 D4:1 F4:1", "B3:3 -:1"]
YM_A2 = ["G4:1.5 Ab4:0.5 G4:1 Eb4:1", "Bb4:1.5 C5:0.5 Bb4:1 G4:0.5 Eb4:0.5", "C5:2 Bb4:0.5 Ab4:0.5 G4:1",
         "F4:1.5 Ab4:0.5 Db5:1.5 C5:0.5", "C5:1 Ab4:0.5 F4:0.5 Eb4:1 F4:1", "D4:1 F4:0.5 Ab4:0.5 B4:1.5 D5:0.5", "C5:3 -:1", ""]
YM_PIZZ = ["0..1..2.0..1..3.", "0..2..1.3..2..4.", "0..1..2.0..1..3.", "2..1..0.2..3..5."]


def your_move() -> Loop:
    """Word Duel: a game of nerves, best of three. C minor, 112 BPM."""
    L = Loop("07-your-move", "Your Move", 112, 707, YM_CHORDS, YM_GROOVES, [
        (0, "Cello", 42, 94, 56, 34), (1, "French horns", 60, 82, 70, 38), (2, "Pizzicato strings", 45, 80, 84, 26),
        (3, "Piano", 0, 84, 48, 24), (4, "Contrabass", 43, 76, 60, 26), (5, "Tremolo strings", 44, 62, 74, 40),
        (6, "Celesta", 8, 74, 82, 44), (7, "Timpani", 47, 84, 58, 30), (8, "Strings", 48, 78, 66, 38), (9, "Drums", 0, 86, 64, 18),
    ], {
        "cello": ("line", 0, 70), "cellosoft": ("line", 0, 54), "horn": ("line", 1, 66), "hornpad": ("pad", 1), "pizz": ("grid", 2, "arp", 58, .45),
        "pno": ("grid", 3, "oct", 62, .5), "pnosoft": ("grid", 3, "oct", 42, .5), "cb": ("grid", 4, "bass", 56, .9), "trem": ("pad", 5), "cel": ("line", 6, 58),
        "timp": ("grid", 7, "timp", 68, .9), "str": ("line", 8, 60), "dr": ("drums", 9),
    })
    # Intro: the clock starts.
    L.section("Cm Cm Abmaj7 G7", pno=["c..c..c.c.......", "c..c..c.c..c..c.", "c..c..c.c..c..c.", "c..c..c.c..c..cc"],
              cb="0---------------", timp=["0...............", "", "0...............", "0..0..0........."],
              dr=["tick", "tick", "tick", "tick2"])
    # A: the cello states the theme, then again an octave up, with a dark Db turn.
    a = L.section("Cm Cm Abmaj7 Abmaj7 Fm9 Fm9 Gsus4 G7 Cm Eb/Bb Abmaj7 Db Fm7 G7 Cm G7", pizz=YM_PIZZ,
                  pno=["c..c..c.c..c..c.", "c.......c..c..c."], cb="0---------------", trem=[0] * 8 + [48] * 8,
                  dr=["tick2", "tick", "tick2", "tick", "pulse", "pulse", "pulse", "toms",
                      "pulse+crash", "pulse", "pulse", "pulse", "pulse", "pulse", "toms", "roll"])
    L.lines("cello", a, YM_A1 + YM_A2)
    L.lines("horn", a + 15, ["-:2 B4:0.5 D5:0.5 F5:0.5 G5:0.5"])
    # B: the horns press the point.
    b = L.section("Ab Bb Gm Cm Ab Bb Gsus4 G7", pizz=["0.1.2.0.1.2.3.4.", "0..2..1.3..2..4."],
                  pno=["c..c..c.c..c..c.", "c..c..c.c..c..cc"], cb="0-------2-------", trem=54,
                  timp=["0...............", "0...............", "0...............", "0..0..0.........",
                        "0...............", "0...............", "0..0..0.0.0.0000", "0000000000000000"],
                  dr=["drive+crash", "drive", "drive2", "drive", "drive", "drive2", "toms", "fillT"])
    L.lines("horn", b, ["Ab4:1.5 C5:0.5 Eb5:2", "D5:1.5 C5:0.5 Bb4:1 F4:1", "G4:1 Bb4:1 D5:1.5 C5:0.5", "Eb5:3 D5:0.5 C5:0.5",
                        "C5:1.5 Eb5:0.5 F5:1 Eb5:1", "D5:1.5 F5:0.5 Eb5:1 D5:1", "C5:2 D5:1 C5:1", "B4:2 D5:1 F5:1"])
    # Thinking: almost nothing, a few celesta ticks while someone decides.
    c = L.section("Fm Fm Cm Cm Db Db G7sus4 G7", trem=36, cb="0---------------",
                  pnosoft=["c---------------", "", "c---------------", "", "c---------------", "", "", ""],
                  pno=["", "", "", "", "", "", "c..c..c.c.......", "c..c..c.c..c..cc"],
                  pizz=["", "", "", "", "", "", "0..1..2.0..1..3.", "0.1.2.0.1.2.3.4."],
                  timp=["", "", "", "", "", "", "0..0..0.0.0.0000", "0000000000000000"],
                  dr=["tick", "tick", "tick", "tick", "tick", "tick", "tick2", "roll"])
    L.lines("cellosoft", c, ["F3:4", "Ab3:2 G3:2", "G3:4", "Eb3:2 D3:2", "Db3:4", "F3:2 Ab3:2", "G3:4", "B2:2 D3:2"])
    L.lines("cel", c, ["-:1 C6:0.5 -:0.5 Ab5:0.5 -:1.5", "-:0.5 G5:0.5 -:1 F5:0.5 -:1.5", "-:1 Eb6:0.5 -:0.5 D6:0.5 -:0.5 C6:0.5 -:0.5",
                       "-:2 G5:1 -:1", "-:1 F6:0.5 -:0.5 Db6:0.5 -:1.5", "-:0.5 Ab5:0.5 -:1 C6:0.5 -:1.5",
                       "-:1 D6:0.5 -:0.5 C6:0.5 -:0.5 B5:0.5 -:0.5", "-:2 G5:0.5 B5:0.5 D6:0.5 F6:0.5"])
    # A': the theme in full, strings doubling the cello an octave up.
    a2 = L.section("Cm Cm Abmaj7 Abmaj7 Fm9 Fm9 Gsus4 G7 Cm Eb/Bb Abmaj7 Db Fm7 G7 Cm G7",
                   pizz=["0.1.2.0.1.2.3.4.", *YM_PIZZ[1:]], pno=["c..c..c.c..c..cc", "c..c..c.c..c..c."], cb="0---------------",
                   hornpad=[50] * 8 + [0] * 8, trem=[0] * 8 + [52] * 8, timp=["0..0..0.........", "0..............."],
                   dr=["drive+crash", "drive", "drive2", "drive", "drive", "drive2", "drive", "fillT",
                       "drive+crash", "drive", "drive2", "drive", "drive", "drive2", "toms", "roll"])
    theme = YM_A1 + YM_A2[:6] + ["C4:1 Eb4:1 G4:1.5 F4:0.5", "D4:1 F4:1 Ab4:1 B4:1"]
    L.lines("cello", a2, theme)
    L.lines("str", a2, [shift(line, 1) for line in theme])
    # Turn: the ostinato alone, the timpani hands the clock back.
    L.section("Cm Cm Abmaj7 G7", pno=["c..c..c.c..c..c.", "c..c..c.c..c..cc"], pizz=YM_PIZZ, cb="0---------------",
              timp=["0...............", "0..0..0.........", "0..0..0.0.0.0000", "0000000000000000"],
              dr=["pulse", "pulse", "toms", "roll"])
    return L


def render_loop(loop: Loop, args) -> dict:
    sketch, start, length = loop.sketch()
    midi, _ = sketch.write()
    entry = {"title": loop.title, "file": loop.slug + ".m4a", "loop_seconds": round(length / RATE, 4), "bpm": loop.bpm,
             "bars": len(loop.bars), "notes": len(sketch.score)}
    if args.fluidsynth and args.soundfont and args.renders:
        args.renders.mkdir(parents=True, exist_ok=True)
        raw = args.renders / (loop.slug + "-raw.wav")
        synthesize(args, midi, raw)
        end = start + length
        # The loop's head fades from the audio that follows its end into its own start,
        # so the wrap is the real continuation and never a click.
        graph = (f"asplit=2[a][b];[a]atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS,afade=t=in:ns={WRAP}[body];"
                 f"[b]atrim=start_sample={end}:end_sample={end + WRAP},asetpts=PTS-STARTPTS,afade=t=out:ns={WRAP}[wrap];"
                 "[body][wrap]amix=inputs=2:duration=first:normalize=0,highpass=f=38,lowpass=f=14000")
        entry.update(master(sketch, raw, graph, args.renders / (loop.slug + ".wav"), ALBUM, "m4a"))
    print(json.dumps(entry), flush=True)
    return entry


def main():
    args = render_args()
    tracks = [render_loop(loop, args) for loop in [photo_finish(), pop_rivals(), your_move()]]
    (HERE / "tracks.json").write_text(json.dumps(tracks, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
