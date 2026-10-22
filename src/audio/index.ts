import { effects, music, voices } from './assets';
import { backend } from './backend';
import { SoundEngine } from './engine';

export const sound = new SoundEngine(backend, { effects, music, voices });
export type { Cue, Emotion } from './assets';
