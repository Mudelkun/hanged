import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioBackend, SoundPlayer } from './types';

const LOAD_POLL_MS = 250, LOAD_TIMEOUT_MS = 20000;

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
    // iOS queues the next pass of the item (AVQueuePlayer), so an AAC loop wraps without a gap.
    if (asset.loop) player.loop = true;
    let settle: (error?: string) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      let poll: ReturnType<typeof setInterval> | undefined, waited = 0;
      settle = error => { clearInterval(poll); settle = () => {}; if (error) reject(new Error(error)); else resolve(); };
      if (player.isLoaded) return settle();
      // The load event can be missed, and a failed item never sends one: ask the player too, and give up eventually.
      poll = setInterval(() => {
        if (player.isLoaded) settle();
        else if ((waited += LOAD_POLL_MS) >= LOAD_TIMEOUT_MS) settle('Audio asset did not load');
      }, LOAD_POLL_MS);
    });
    const ends = new Set<() => void>();
    const sub = player.addListener('playbackStatusUpdate', status => {
      const error = (status as { error?: string }).error;
      if (status.isLoaded) settle(); else if (error) settle(error);
      if (status.didJustFinish) ends.forEach(callback => callback());
    });
    return {
      ready,
      get volume() { return player.volume; },
      set volume(value) { player.volume = value; },
      get playing() { return player.playing; },
      play: () => player.play(),
      pause: () => player.pause(),
      rewind: () => player.seekTo(0),
      remove: () => { sub.remove(); ends.clear(); settle(); player.remove(); },
      onEnd: callback => { ends.add(callback); return () => { ends.delete(callback); }; },
    };
  },
};
