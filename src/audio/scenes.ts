import type { SoundEvent } from './engine';

/** Fractions follow the shared balloon keyframes; duration comes from that rig. */
export function balloonSounds(last: boolean, duration: number, character: string, worried: boolean): SoundEvent[] {
  if (!last) return [
    { cue: 'stretch', gain: .7 }, { cue: 'pop', at: duration * .16 }, { cue: 'sink', at: duration * .21, gain: .7 },
    ...(worried ? [{ voice: 'worry' as const, character, at: duration * .38, gain: .8 }] : []),
  ];
  return [
    { cue: 'last-stretch' }, { cue: 'last-pop', at: duration * .16 }, { cue: 'string', at: duration * .18 },
    { cue: 'fall', at: duration * .38 }, { voice: 'fall', character, at: duration * .38 },
    { cue: 'impact', at: duration * .60 }, { voice: 'land', character, at: duration * .614, gain: .85 },
    { cue: 'dust', at: duration * .623 }, { cue: 'bounce', at: duration * .72 },
    { cue: 'stars', at: duration * .755, gain: .65 }, { voice: 'recover', character, at: duration * .927, gain: .75 },
  ];
}
