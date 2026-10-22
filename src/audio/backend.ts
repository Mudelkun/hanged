import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioBackend, SoundPlayer } from './types';

export const backend: AudioBackend = {
  configure: () => setAudioModeAsync({
    playsInSilentMode: false,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
  }),
  unlock() {},
  create(asset): SoundPlayer {
    const player = createAudioPlayer(asset.source, { updateInterval: 500, keepAudioSessionActive: true });
    let loaded = () => {};
    const ready = player.isLoaded ? Promise.resolve() : new Promise<void>(resolve => { loaded = resolve; });
    const ends = new Set<() => void>();
    const sub = player.addListener('playbackStatusUpdate', status => {
      if (status.isLoaded) loaded();
      if (status.didJustFinish) ends.forEach(callback => callback());
    });
    return {
      ready,
      get volume() { return player.volume; },
      set volume(value) { player.volume = value; },
      play: () => player.play(),
      pause: () => player.pause(),
      rewind: () => player.seekTo(0),
      remove: () => { sub.remove(); ends.clear(); loaded(); player.remove(); },
      onEnd: callback => { ends.add(callback); return () => { ends.delete(callback); }; },
    };
  },
};
