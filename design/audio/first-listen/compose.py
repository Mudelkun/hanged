"""Original Hanged music sketches for audition only; nothing is loaded by the app.

Python standard library only. Notes and accompaniment are written explicitly;
seeded jitter changes performance timing/velocity, never chooses the composition.
Render the MIDI with FluidSynth and a separately downloaded GeneralUser GS bank.
"""

from __future__ import annotations

import argparse
import json
import random
import struct
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PPQ = 960
PITCH = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi_note(name: str) -> int:
    accidental = name[1:-1]
    return 12 * (int(name[-1]) + 1) + PITCH[name[0]] + accidental.count("#") - accidental.count("b")


def vlq(value: int) -> bytes:
    data = [value & 127]
    while value >> 7:
        value >>= 7
        data.insert(0, (value & 127) | 128)
    return bytes(data)


def chunk(kind: bytes, data: bytes) -> bytes:
    return kind + struct.pack(">I", len(data)) + data


class Sketch:
    def __init__(self, slug: str, title: str, tempos: list[int], seed: int, out: Path = HERE):
        self.slug, self.title, self.tempos, self.out = slug, title, tempos, out
        self.rng = random.Random(seed)
        self.events: dict[int, list[tuple[int, int, bytes]]] = {}
        self.parts: dict[int, dict] = {}
        self.score: list[dict] = []
        self.end = 0.0

    def event(self, channel: int, beat: float, order: int, payload: bytes):
        self.events[channel].append((max(0, round(beat * PPQ)), order, payload))

    def part(self, channel: int, name: str, program: int, volume: int, pan: int, reverb: int = 28):
        self.parts[channel] = {"name": name, "gm_program_zero_based": program, "volume": volume, "pan": pan}
        self.events[channel] = []
        title = name.encode()
        self.event(channel, 0, -10, b"\xff\x03" + vlq(len(title)) + title)
        self.event(channel, 0, -9, bytes([0xC0 | channel, program]))
        for controller, value in [(7, volume), (10, pan), (91, reverb), (93, 0)]:
            self.event(channel, 0, -8, bytes([0xB0 | channel, controller, value]))

    def note(self, channel: int, beat: float, pitch: str, duration: float, velocity: int = 64):
        # Small expressive offsets, with written phrase lengths and rests intact.
        actual = max(0.02, 0.10 + beat + self.rng.uniform(-0.015, 0.015))
        length = max(0.06, duration + self.rng.uniform(-0.016, 0.016))
        vel = min(110, max(24, velocity + self.rng.randint(-3, 3)))
        key = midi_note(pitch)
        self.event(channel, actual, 1, bytes([0x90 | channel, key, vel]))
        self.event(channel, actual + length, 0, bytes([0x80 | channel, key, 0]))
        self.score.append({"part": self.parts[channel]["name"], "beat": round(actual, 4), "pitch": pitch, "duration": round(length, 4), "velocity": vel})
        self.end = max(self.end, actual + length)

    def line(self, channel: int, bar: int, written: str, velocity: int = 65):
        # pitch:duration, with '-' for a rest; one phrase can cross a bar line.
        beat = bar * 4
        for i, item in enumerate(written.split()):
            pitch, duration_text = item.split(":")
            duration = float(duration_text)
            if pitch != "-":
                # A slight taper on the ends of phrases, not identical MIDI hits.
                self.note(channel, beat, pitch, duration * 0.88, velocity + (2 if i == 0 else -1))
            beat += duration

    def chord(self, channel: int, bar: int, offset: float, pitches: str, duration: float, velocity: int = 50, spread: float = 0.018):
        for i, pitch in enumerate(pitches.split()):
            self.note(channel, 4 * bar + offset + i * spread, pitch, duration, velocity - i)

    def write(self) -> tuple[Path, float]:
        master = [(0, -1, b"\xff\x03" + vlq(len(self.title.encode())) + self.title.encode()), (0, 0, b"\xff\x58\x04\x04\x02\x18\x08")]
        for bar, tempo in enumerate(self.tempos):
            master.append((bar * 4 * PPQ, 1, b"\xff\x51\x03" + round(60_000_000 / tempo).to_bytes(3, "big")))
        end_tick = round((self.end + 1) * PPQ)
        chunks = []
        for events in [master, *self.events.values()]:
            events = sorted(events, key=lambda item: (item[0], item[1]))
            data, previous = bytearray(), 0
            for tick, _, payload in events:
                data.extend(vlq(tick - previous) + payload)
                previous = tick
            data.extend(vlq(max(0, end_tick - previous)) + b"\xff\x2f\x00")
            chunks.append(chunk(b"MTrk", bytes(data)))
        target = self.out / (self.slug + ".mid")
        target.write_bytes(chunk(b"MThd", struct.pack(">HHH", 1, len(chunks), PPQ)) + b"".join(chunks))
        duration = 0.0
        remaining = self.end
        for tempo in self.tempos:
            beats = min(4.0, max(0.0, remaining))
            duration += beats * 60 / tempo
            remaining -= beats
        duration += max(0, remaining) * 60 / self.tempos[-1] + 3.2
        (self.out / (self.slug + ".score.json")).write_text(json.dumps({"title": self.title, "tempos": self.tempos, "parts": self.parts, "notes": self.score}, indent=2) + "\n", encoding="utf-8")
        return target, duration


def little_detours() -> Sketch:
    s = Sketch("01-little-detours", "Little Detours", [100, 101, 101, 97, 100, 103, 101, 95, 99, 102, 102, 98, 100, 100, 98, 95, 100, 98, 94, 85], 21)
    s.part(0, "Clarinet", 71, 88, 70)
    s.part(1, "Piano", 0, 79, 56, 25)
    s.part(2, "Pizzicato strings", 45, 64, 46, 24)
    s.part(3, "Bassoon", 70, 70, 78, 24)
    # A conversation: the opening idea returns transformed in bars 9 and 17.
    melody = [
        "-:0.5 F#4:0.5 A4:0.75 B4:0.25 A4:1 F#4:0.5 -:0.5",
        "G4:0.75 B4:0.25 D5:1.5 B4:0.5 A4:0.5 -:0.5",
        "G4:0.5 F#4:0.5 E4:1 B4:0.5 A4:0.5 G4:0.5 -:0.5",
        "F#4:0.5 E4:0.5 C#4:0.5 E4:0.5 A4:1.5 -:0.5",
        "-:1 A4:0.5 C#5:0.5 E5:0.75 C#5:0.25 B4:0.5 A4:0.5",
        "F#4:0.5 D#4:0.5 F#4:1 A4:0.75 B4:0.25 F#4:0.5 -:0.5",
        "G4:1 B4:0.5 A4:0.5 F#4:0.75 E4:0.25 G4:0.5 -:0.5",
        "E4:0.5 C#4:0.5 B3:0.5 C#4:0.5 E4:1 -:1",
        "F#4:0.75 A4:0.25 E5:0.5 D5:0.5 B4:1 A4:0.5 -:0.5",
        "G#4:0.5 A#4:0.5 C#5:0.75 E5:0.25 D5:0.5 C#5:0.5 A#4:0.5 -:0.5",
        "B4:1.5 F#4:0.5 A4:0.75 C#5:0.25 D5:0.5 -:0.5",
        "B4:0.5 G#4:0.5 F#4:0.5 E4:0.5 D4:0.5 F#4:0.5 G#4:1",
        "B4:0.5 A4:0.5 G4:1 F#4:0.5 E4:0.5 -:1",
        "-:1 E4:0.5 G4:0.5 F#4:0.5 E4:0.5 C#4:0.5 -:0.5",
        "D4:1.5 F#4:0.5 A4:1 B4:0.5 A4:0.5",
        "F#4:1 E4:0.5 D4:1 -:1.5",
        "-:0.5 B4:0.5 D5:1 A4:0.5 G4:0.5 B4:0.5 -:0.5",
        "Bb4:0.75 A4:0.25 G4:1 E4:0.5 D4:0.5 -:1",
        "F#4:0.5 A4:0.5 B4:0.75 A4:0.25 G4:0.5 E4:0.5 C#4:0.5 -:0.5",
        "D4:1 F#4:0.5 E4:0.5 D4:2",
    ]
    chords = ["D3 F#3 A3 B3", "G2 F#3 B3 D4", "E3 G3 B3 D4", "A2 G3 B3 C#4", "F#2 A3 C#4 E4", "B2 A3 D#4 F#4", "E3 G3 B3 F#4", "A2 G3 C#4 F#4", "D3 F#3 A3 E4", "F#2 A#3 C#4 E4", "B2 A3 C#4 D4", "E3 G#3 B3 D4", "E3 G3 B3 D4", "A2 G3 C#4 F#4", "D3 F#3 A3 B3", "D3 F#3 B3 E4", "G2 F#3 A3 B3", "G2 Bb3 D4 E4", "A2 G3 B3 C#4", "D3 F#3 A3 B3"]
    # Every bar's accompaniment has its own placement. Several bars are almost empty.
    piano = [[(0,1.2),(2.5,.7)],[(.5,1.4)],[(0,.8),(2,1.2)],[(1,1.5)],[(0,1.8)],[(.75,.7),(2.5,.7)],[(0,1),(2.75,.7)],[(.5,1.4)],[(0,1.4),(3,.6)],[(.5,.7),(2,1)],[(0,1.6)],[(1,.7),(2.75,.7)],[(.25,1.2)],[(0,.8),(2.5,.8)],[(.5,1.8)],[(0,1)],[(0,1.2),(2.75,.7)],[(.5,1.8)],[(0,.7),(2,1.1)],[(0,3.8)]]
    pizz = [(0,2.1,"A3"),(1,.1,"G3"),(2,3.2,"B3"),(4,2.6,"C#4"),(5,.2,"B3"),(6,1.7,"G3"),(7,2.1,"A3"),(8,3.2,"D4"),(10,.2,"F#3"),(11,3.25,"B3"),(12,2.7,"E4"),(14,3.3,"F#3"),(16,1.8,"D4"),(17,2.7,"G3"),(18,3.1,"A3")]
    for bar, phrase in enumerate(melody):
        s.line(0, bar, phrase, 65 if bar < 8 else 68 if bar < 13 else 62)
        for offset, duration in piano[bar]:
            s.chord(1, bar, offset, chords[bar], duration, 50 if bar != 19 else 45)
    for bar, beat, pitch in pizz:
        s.note(2, bar*4+beat, pitch, .5, 58)
    for bar, line in [(3,"-:2 E3:0.5 G3:0.5 A3:0.5 -:0.5"),(7,"-:2 G3:0.5 E3:0.5 C#3:0.5 -:0.5"),(12,"-:2 B3:0.5 A3:0.5 G3:0.5 -:0.5"),(15,"-:1 F#3:0.5 A3:0.5 B3:0.5 A3:0.5 F#3:0.5 -:0.5"),(17,"-:2 Bb3:0.5 A3:0.5 G3:0.5 -:0.5")]:
        s.line(3, bar, line, 54)
    return s


def sunday_window() -> Sketch:
    s = Sketch("02-sunday-window", "Sunday Window", [94,96,95,91,94,97,96,90,95,98,96,92,95,94,93,89,92,81], 87)
    s.part(0, "Piano melody", 0, 91, 61, 24)
    s.part(1, "Piano harmony", 0, 74, 61, 24)
    s.part(2, "Acoustic bass", 32, 90, 65, 12)
    s.part(3, "Vibraphone answers", 11, 59, 76, 30)
    phrases = [
        "-:0.5 A4:0.75 C5:0.25 D5:0.5 C5:1 A4:0.5 -:0.5",
        "G4:0.5 A4:0.5 Bb4:0.75 D5:0.25 C5:1 G4:0.5 -:0.5",
        "-:1 A4:0.5 C5:0.5 E5:0.75 D5:0.25 C5:0.5 A4:0.5",
        "G4:0.75 F4:0.25 E4:0.5 D4:0.5 F4:1 -:1",
        "Bb4:0.75 A4:0.25 G4:1 D5:0.5 F5:0.5 E5:0.5 -:0.5",
        "Eb5:0.5 D5:0.5 Bb4:0.75 A4:0.25 G4:1 -:1",
        "A4:1 C5:0.5 D5:0.5 G5:0.5 F5:0.5 E5:0.5 -:0.5",
        "D5:0.5 C5:0.75 A4:0.25 G4:1 -:1.5",
        "-:0.5 F5:0.5 E5:0.5 D5:0.5 C5:0.75 A4:0.25 Bb4:0.5 C5:0.5",
        "B4:0.5 D5:0.5 F5:0.5 A5:0.5 G5:1 F5:0.5 -:0.5",
        "E5:0.75 D5:0.25 C5:1 G4:0.5 A4:0.5 C5:0.5 -:0.5",
        "Db5:0.5 C5:0.5 Bb4:1 G4:0.75 E4:0.25 -:1",
        "A4:0.5 C5:0.5 D5:0.75 E5:0.25 F5:1 C5:0.5 -:0.5",
        "D5:0.75 F5:0.25 A5:0.5 G5:0.5 F5:0.5 D5:0.5 Bb4:0.5 -:0.5",
        "C5:1 A4:0.5 G4:0.5 F4:0.75 E4:0.25 D4:0.5 -:0.5",
        "E4:0.5 G4:0.5 Bb4:0.75 A4:0.25 G4:1 -:1",
        "A4:0.75 C5:0.25 D5:0.5 C5:1 A4:0.5 G4:0.5 -:0.5",
        "F4:1 A4:0.5 G4:0.5 F4:2",
    ]
    chords = ["A3 D4 G4", "Bb3 D4 F4", "G3 C4 E4", "F3 A3 C4", "F3 Bb3 D4", "G3 Bb3 Eb4", "A3 C4 E4", "G3 Bb3 E4", "F3 A3 D4", "F3 A3 B3", "E3 G3 C4", "E3 Bb3 Db4", "A3 C4 G4", "A3 D4 F4", "A3 C4 F4", "G3 Bb3 E4", "A3 C4 D4", "A3 C4 F4"]
    # No walking-bass loop: sustained roots, pickups, and deliberate gaps.
    bass = [(0,0,"F2",2.3),(1,.5,"Bb2",2),(2,0,"A2",2.2),(3,1,"D2",2.4),(4,0,"G2",2.5),(5,.75,"C3",2),(6,.25,"F2",1.8),(7,1.5,"C2",1.4),(8,0,"D2",2.8),(9,.5,"G2",2.1),(10,0,"C3",2),(11,1,"C2",1.8),(12,0,"F2",2.6),(13,.5,"Bb2",2),(14,0,"A2",1.6),(14,2.7,"D3",.8),(15,.75,"C3",2.3),(16,0,"F2",2.5),(17,0,"F2",3.8)]
    comp = [[(0,1.4),(2.6,.7)],[(1,1.7)],[(.25,1.2),(2.75,.6)],[(.75,1.9)],[(0,1.7)],[(1.25,1)],[(.5,1.4),(3,.5)],[(.25,1.5)],[(0,1.5),(2.5,.8)],[(.75,1.5)],[(.25,1.8)],[(1,1.4)],[(0,1.2),(2.75,.7)],[(.5,1.7)],[(0,1),(2.5,.6)],[(1,1.5)],[(0,1.5)],[(0,4)]]
    for bar, phrase in enumerate(phrases):
        s.line(0,bar,phrase,69 if 8 <= bar < 14 else 64)
        for offset,duration in comp[bar]:
            s.chord(1,bar,offset,chords[bar],duration,45)
    for bar,offset,pitch,duration in bass:
        s.note(2,bar*4+offset,pitch,duration,68)
    for bar,line in [(3,"-:2.5 A5:0.5 C6:0.5 -:0.5"),(7,"-:2 E5:0.5 D5:0.5 C5:0.5 -:0.5"),(11,"-:2.5 G5:0.5 E5:0.5 -:0.5"),(15,"-:2.5 D5:0.5 E5:0.5 -:0.5")]:
        s.line(3,bar,line,49)
    return s


def updraft() -> Sketch:
    s = Sketch("03-updraft", "Updraft", [76,78,77,73,76,79,77,73,76,77,75,72,74,75,70,64], 145)
    s.part(0,"Cello",42,76,58,35)
    s.part(1,"Harp",46,72,74,37)
    s.part(2,"Soft piano",0,70,54,30)
    s.part(3,"String halo",48,49,69,43)
    phrases = [
        "-:1 G3:1 Bb3:1 D4:1",
        "Eb4:1.5 D4:0.5 C4:1 Bb3:1",
        "G3:1 Ab3:0.5 Bb3:0.5 F4:1.5 -:0.5",
        "Eb4:1 D4:0.5 C4:0.5 Bb3:1 -:1",
        "C4:1 Eb4:0.75 G4:0.25 F4:1 Eb4:1",
        "D4:1 Bb3:0.5 C4:0.5 D4:1 -:1",
        "Eb4:0.75 F4:0.25 G4:1 Bb4:1 G4:0.5 F4:0.5",
        "Eb4:1.5 D4:0.5 C4:1 -:1",
        "Ab3:1 C4:1 Eb4:1 F4:0.5 -:0.5",
        "G4:0.5 F4:0.5 Eb4:1 D4:1 Bb3:1",
        "C4:1 Eb4:0.5 D4:0.5 C4:1 G3:0.5 -:0.5",
        "Bb3:1 D4:0.75 F4:0.25 Eb4:1 -:1",
        "G3:0.5 Bb3:0.5 D4:1 Eb4:1 G4:0.5 F4:0.5",
        "Eb4:1 C4:0.5 Bb3:0.5 Ab3:1 -:1",
        "Bb3:1 D4:0.5 F4:0.5 Eb4:0.75 D4:0.25 Bb3:0.5 -:0.5",
        "Eb4:3.5 -:0.5",
    ]
    harmonies = ["Eb3 G3 Bb3 F4", "Ab2 G3 C4 Eb4", "F3 Ab3 C4 Eb4", "Bb2 Ab3 C4 D4", "C3 G3 Bb3 Eb4", "G2 F3 Bb3 D4", "Ab2 G3 C4 Eb4", "Bb2 Ab3 D4 F4", "Ab2 G3 C4 Eb4", "G2 Bb3 D4 F4", "F3 Ab3 C4 Eb4", "Bb2 Ab3 C4 D4", "Eb3 G3 Bb3 D4", "Ab2 G3 C4 Eb4", "Bb2 Ab3 C4 D4", "Eb3 G3 Bb3 F4"]
    harp_phrases = [(0,2.1,"Bb4",.8),(0,3.25,"F5",.6),(1,.4,"G4",1),(1,2.8,"C5",1),(2,1.7,"Eb5",.8),(3,2.7,"C5",.5),(3,3.3,"D5",.5),(4,.15,"G4",1.5),(5,2.5,"F5",.8),(6,.6,"C5",.9),(6,2.9,"Eb5",.8),(7,1.8,"D5",1),(8,1.1,"G4",.7),(8,3.1,"Bb4",.6),(9,.25,"D5",1.3),(10,2.4,"Eb5",.8),(11,2.8,"C5",.5),(11,3.4,"D5",.5),(12,.4,"G4",1),(12,2.9,"F5",.7),(13,1.6,"C5",1),(14,2.8,"D5",.8),(15,.2,"G4",2.2),(15,1.4,"Bb4",2)]
    for bar,line in enumerate(phrases):
        s.line(0,bar,line,68 if 4 <= bar < 8 else 61)
        s.chord(2,bar,[0,.3,.7,.15,.5,.1,.4,.8,0,.6,.3,.9,.2,.5,0,.1][bar],harmonies[bar],2.4 if bar < 15 else 3.8,43)
    for bar,offset,pitch,duration in harp_phrases:
        s.note(1,bar*4+offset,pitch,duration,53)
    # Long, quietly moving inner voices enter only in the middle and the final lift.
    for bar,chord,duration in [(4,"G4 Bb4",3.8),(5,"F4 Bb4",3.5),(6,"G4 C5",3.8),(7,"F4 Bb4",2.8),(12,"G4 Bb4",3.5),(13,"G4 C5",3.4),(14,"F4 Bb4",3.4),(15,"G4 Bb4",3.7)]:
        s.chord(3,bar,.3,chord,duration,45,0.025)
    return s


def run(command: list[str]):
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError(completed.stderr or completed.stdout)
    return completed


def render_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fluidsynth", type=Path)
    parser.add_argument("--soundfont", type=Path)
    parser.add_argument("--renders", type=Path, help="Directory outside the app for WAV masters")
    return parser.parse_args()


def render(sketch: Sketch, args: argparse.Namespace, album: str = "Hanged - first listen") -> dict:
    """Writes the sketch's MIDI and score; with the tools given, also its WAV master and MP3."""
    midi, duration = sketch.write()
    entry = {"title": sketch.title, "file": sketch.slug + ".mp3", "seconds": round(duration, 2), "notes": len(sketch.score)}
    if args.fluidsynth and args.soundfont and args.renders:
        mp3 = sketch.out / entry["file"]
        args.renders.mkdir(parents=True, exist_ok=True)
        raw = args.renders / (sketch.slug + "-raw.wav")
        master = args.renders / (sketch.slug + ".wav")
        run([str(args.fluidsynth), "-ni", "-g", "0.65", "-r", "48000", "-F", str(raw), "-T", "wav", "-O", "float", "-o", "synth.reverb.room-size=0.38", "-o", "synth.reverb.damp=0.55", "-o", "synth.reverb.width=65", "-o", "synth.reverb.level=0.26", "-o", "synth.chorus.active=0", str(args.soundfont), str(midi)])
        # Quiet audition masters: transparent normalization, never a pumping beat.
        base = f"atrim=0:{duration:.3f},afade=t=in:d=0.025,afade=t=out:st={duration-1.3:.3f}:d=1.3,highpass=f=38,lowpass=f=13000"
        measure = run(["ffmpeg", "-hide_banner", "-i", str(raw), "-af", base + ",loudnorm=I=-19:TP=-2:LRA=14:print_format=json", "-f", "null", "-"])
        stats, _ = json.JSONDecoder().raw_decode(measure.stderr[measure.stderr.rfind("{"):])
        normal = ("loudnorm=I=-19:TP=-2:LRA=14:linear=true:"
                  f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:"
                  f"measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}")
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", base + "," + normal, "-ar", "48000", "-c:a", "pcm_s24le", str(master)])
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(master), "-codec:a", "libmp3lame", "-b:a", "192k", "-metadata", "title=" + sketch.title, "-metadata", "album=" + album, "-metadata", "comment=Original instrumental audition sketch. Not approved or integrated.", str(mp3)])
        probe = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(mp3)])
        entry["seconds"] = round(float(probe.stdout), 2)
        entry["pre_master_measurement"] = stats
        entry["wav_master"] = str(master)
    print(json.dumps(entry), flush=True)
    return entry


def main():
    args = render_args()
    tracks = [render(sketch, args) for sketch in [little_detours(), sunday_window(), updraft()]]
    (HERE / "tracks.json").write_text(json.dumps(tracks, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
