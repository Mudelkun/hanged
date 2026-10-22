import { effects, music, voices } from '../assets';
import { MIX, SoundEngine } from '../engine';
import { balloonSounds } from '../scenes';
import type { AudioBackend, SoundAsset, SoundPlayer } from '../types';

class Player implements SoundPlayer {
  volume = 1;
  plays = 0;
  paused = true;
  removed = false;
  ends = new Set<() => void>();
  ready = Promise.resolve();
  constructor(readonly asset: SoundAsset) {}
  play() { this.plays++; this.paused = false; }
  pause() { this.paused = true; }
  rewind() { return Promise.resolve(); }
  remove() { this.removed = true; this.pause(); }
  onEnd(callback: () => void) { this.ends.add(callback); return () => { this.ends.delete(callback); }; }
  finish() { this.paused = true; this.ends.forEach(fn => fn()); }
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function setup() {
  const players: Player[] = [];
  const backend: AudioBackend = { configure: () => Promise.resolve(), unlock() {}, create(asset) { const p = new Player(asset); players.push(p); return p; } };
  const engine = new SoundEngine(backend, { effects, voices, music });
  return { engine, players, backend, played: () => players.filter(p => p.plays).map(p => p.asset.id) };
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(10000); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('rotates frequent takes, throttles double presses, and keeps normal FX below voice/music headroom', async () => {
  const { engine, players, played } = setup(); await engine.start(false);
  engine.play('key'); engine.play('key'); await flush();
  jest.advanceTimersByTime(40); engine.play('key'); await flush();
  expect(played()).toEqual(['key-1', 'key-2']);
  expect(players.find(p => p.asset.id === 'key-1')?.volume).toBe(MIX.effects);
  expect(played()).not.toContain('detours'); engine.dispose();
});

test('effects mute cancels queued and already loading sounds; unmute does not replay them', async () => {
  const { engine, players } = setup(); await engine.start(false);
  let loaded = () => {};
  const key = players.find(p => p.asset.id === 'key-1')!;
  key.ready = new Promise(resolve => { loaded = resolve; });
  engine.play('key'); engine.sequence([{ cue: 'impact', at: 200 }]);
  engine.settings(false, true); loaded(); engine.settings(true, true);
  jest.advanceTimersByTime(500); await flush();
  expect(players.every(p => p.plays === 0)).toBe(true); engine.dispose();
});

test.each(['background', 'route', 'blur'] as const)('%s cancels the final fall and stale async responses', async reason => {
  const { engine, played } = setup(); await engine.start(false);
  const scope = engine.scope(); scope.activate(); const stillCurrent = scope.continuation();
  scope.sequence(balloonSounds(true, 2200, 'ribbit', true)); await flush();
  if (reason === 'background') { engine.setForeground(false); engine.setForeground(true); }
  if (reason === 'route') engine.routeChanged();
  if (reason === 'blur') { scope.deactivate(); scope.activate(); }
  expect(stillCurrent()).toBe(false);
  jest.advanceTimersByTime(3000); await flush();
  expect(played()).toEqual(['last-stretch-1']); engine.dispose();
});

test('only one character voice plays at once, with the chosen character and ducked music', async () => {
  const { engine, players } = setup(); await engine.start(true); await flush();
  jest.advanceTimersByTime(400);
  engine.voice('mochi', 'joy'); await flush(); engine.voice('ribbit', 'land'); await flush();
  expect(players.find(p => p.asset.id === 'voice-mochi-joy')?.paused).toBe(true);
  expect(players.find(p => p.asset.id === 'voice-ribbit-land')?.volume).toBe(MIX.voices);
  jest.advanceTimersByTime(320);
  expect(players.find(p => p.asset.id === 'detours')?.volume).toBeCloseTo(MIX.duckedMusic);
  jest.advanceTimersByTime(2000);
  expect(players.find(p => p.asset.id === 'detours')?.volume).toBeCloseTo(MIX.music); engine.dispose();
});

test('music pauses independently, resumes, and advances through all three compositions with a gap', async () => {
  const { engine, players } = setup(); await engine.start(true); await flush();
  const first = players.find(p => p.asset.id === 'detours')!;
  engine.settings(false, true); expect(first.paused).toBe(false);
  engine.settings(false, false); expect(first.paused).toBe(true);
  engine.settings(false, true); await flush(); expect(first.plays).toBe(2);
  first.finish(); jest.advanceTimersByTime(3999); await flush(); expect(players.some(p => p.asset.id === 'window')).toBe(false);
  jest.advanceTimersByTime(1); await flush();
  const second = players.find(p => p.asset.id === 'window')!; expect(second.plays).toBe(1);
  second.finish(); jest.advanceTimersByTime(4000); await flush(); expect(players.find(p => p.asset.id === 'updraft')?.plays).toBe(1);
  engine.dispose(); expect(players.every(p => p.removed)).toBe(true);
});

test('bounds native player resources and simultaneous layers during rapid bursts', async () => {
  const { engine, players } = setup(); await engine.start(false);
  for (const cue of Object.keys(effects) as (keyof typeof effects)[]) {
    engine.play(cue); await flush(); jest.advanceTimersByTime(41);
    expect(players.filter(p => !p.paused && !p.removed).length).toBeLessThanOrEqual(MIX.maxLayers);
    expect(players.filter(p => !p.removed).length).toBeLessThanOrEqual(MIX.maxPlayers + 1); // music
  }
  engine.dispose(); expect(players.every(p => p.removed)).toBe(true);
});

test('a sound that loads too late is dropped rather than playing after its animation', async () => {
  const { engine, players } = setup(); await engine.start(false);
  let loaded = () => {}; const key = players.find(p => p.asset.id === 'key-1')!;
  key.ready = new Promise(resolve => { loaded = resolve; });
  engine.play('key'); jest.advanceTimersByTime(500); loaded(); await flush();
  expect(key.plays).toBe(0); engine.dispose();
});

test('all characters have six distinct asset identities and fall contacts follow animation time', () => {
  expect(Object.keys(effects)).toHaveLength(65);
  expect(Object.values(effects).flat()).toHaveLength(150);
  expect(Object.keys(voices)).toHaveLength(15);
  expect(new Set(Object.values(voices).flatMap(v => Object.values(v).map(a => a.id))).size).toBe(90);
  const fall = balloonSounds(true, 2200, 'bun', true);
  expect(fall.find(e => 'cue' in e && e.cue === 'impact')?.at).toBe(1320);
  expect(fall.find(e => 'cue' in e && e.cue === 'bounce')?.at).toBe(1584);
});
