import { effects, loops, music, voices } from './assets';
import { backend } from './backend';
import { SoundEngine } from './engine';

export const sound = new SoundEngine(backend, { effects, music, voices, loops });
export type { Cue, Emotion, MatchMusic } from './assets';
