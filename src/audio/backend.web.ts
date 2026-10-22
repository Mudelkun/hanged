import { Asset } from 'expo-asset';
import type { AudioBackend, SoundPlayer } from './types';

// Web Audio supports soft mixing and reliable volume controls on mobile Safari too.
let context: AudioContext | undefined;
let output: GainNode;
function audioContext() {
  if (!context) {
    context = new AudioContext();
    output = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -9; limiter.knee.value = 12; limiter.ratio.value = 8;
    limiter.attack.value = .003; limiter.release.value = .18;
    output.connect(limiter); limiter.connect(context.destination);
  }
  return context;
}
export const backend: AudioBackend = {
  configure: () => Promise.resolve(),
  unlock: () => { void audioContext().resume().catch(() => {}); },
  create(asset): SoundPlayer {
    const ctx = audioContext(), gain = ctx.createGain();
    gain.connect(output);
    let buffer: AudioBuffer | undefined, source: AudioBufferSourceNode | undefined;
    let offset = 0, started = 0, removed = false;
    const ends = new Set<() => void>();
    const request = new AbortController();
    const ready = fetch(Asset.fromModule(asset.source).uri, { signal: request.signal })
      .then(response => { if (!response.ok) throw new Error('Audio asset unavailable'); return response.arrayBuffer(); })
      .then(bytes => ctx.decodeAudioData(bytes)).then(decoded => { if (!removed) buffer = decoded; });
    // A disposed/prewarmed asset may never be played. Its rejection still needs a consumer.
    void ready.catch(() => {});
    const pause = () => {
      if (!source) return;
      offset = Math.min(buffer?.duration ?? 0, offset + ctx.currentTime - started);
      source.onended = null; source.stop(); source.disconnect(); source = undefined;
    };
    return {
      ready,
      get volume() { return gain.gain.value; },
      set volume(value) { gain.gain.setValueAtTime(value, ctx.currentTime); },
      play() {
        if (!buffer || removed || source) return;
        source = ctx.createBufferSource(); source.buffer = buffer; source.connect(gain);
        source.onended = () => { source?.disconnect(); source = undefined; offset = 0; ends.forEach(callback => callback()); };
        started = ctx.currentTime; source.start(0, offset);
      },
      pause,
      rewind: () => { pause(); offset = 0; return Promise.resolve(); },
      remove: () => { removed = true; request.abort(); pause(); gain.disconnect(); buffer = undefined; ends.clear(); },
      onEnd: callback => { ends.add(callback); return () => { ends.delete(callback); }; },
    };
  },
};
