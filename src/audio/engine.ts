import type { Cue, Emotion } from './assets';
import type { AudioBackend, SoundAsset, SoundPlayer } from './types';

export const MIX = { effects: .55, voices: .62, music: .22, duckedMusic: .09, maxLayers: 8, maxPlayers: 48 } as const;
type EventBase = { at?: number; gain?: number };
export type SoundEvent = EventBase & ({ cue: Cue } | { voice: Emotion; character: string });
type Bank = { effects: Record<Cue, SoundAsset[]>; voices: Record<string, Record<Emotion, SoundAsset>>; music: SoundAsset[] };
type Entry = { asset: SoundAsset; player: SoundPlayer; used: number; token: number; busy: boolean; owner?: SoundScope; vocal: boolean };
const noop = () => {};
const safely = (action: () => void) => { try { action(); } catch { /* Audio must never block a game action. */ } };

/** Owns bounded playback resources; game rules and animation state never depend on audio. */
export class SoundEngine {
  private running = false;
  private foreground = true;
  private unlocked = false;
  private effectsOn = true;
  private musicOn = true;
  private generation = 0;
  private routeGeneration = 0;
  private entries = new Map<string, Entry>();
  private variants = new Map<Cue, number>();
  private sequences = new Set<() => void>();
  private lastCue = new Map<string, number>();
  private track = 0;
  private musicPlayer?: SoundPlayer;
  private musicPlaying = false;
  private musicSent = 0;
  private musicRequest = 0;
  private nextTrack?: ReturnType<typeof setTimeout>;
  private duckTimer?: ReturnType<typeof setTimeout>;
  private fadeTimer?: ReturnType<typeof setInterval>;
  private duckUntil = 0;

  constructor(private backend: AudioBackend, private bank: Bank) {}

  async start(autoplay: boolean) {
    const generation = ++this.generation;
    try { await this.backend.configure(); } catch { return; }
    if (generation !== this.generation) return;
    this.running = true;
    this.unlocked = autoplay;
    this.warm(['key', 'correct', 'wrong', 'pop', 'primary', 'tab']);
    this.prepareMusic();
    this.startMusic();
  }

  unlock = () => {
    this.unlocked = true;
    safely(() => this.backend.unlock());
    this.startMusic();
  };

  settings(effects: boolean, music: boolean) {
    if (this.effectsOn && !effects) this.stopEffects();
    this.effectsOn = effects;
    this.musicOn = music;
    if (music) this.startMusic(); else this.pauseMusic();
  }

  setForeground(active: boolean) {
    this.foreground = active;
    if (!active) { this.stopEffects(); this.pauseMusic(); }
    else this.startMusic();
  }

  routeChanged() {
    this.routeGeneration++;
    // One-shot navigation clicks may finish. A scene/voice from the old page may not.
    this.cancelScenes();
  }

  scope() { return new SoundScope(this); }
  get sceneVersion() { return this.routeGeneration; }

  warm(cues: Cue[], character?: string) {
    if (!this.running) return;
    for (const cue of cues) for (const asset of this.bank.effects[cue]) this.entry(asset);
    if (character) for (const asset of Object.values(this.bank.voices[character] ?? this.bank.voices.mochi)) this.entry(asset);
  }

  play(cue: Cue, gain = 1, owner?: SoundScope) {
    if (!this.canPlay(owner)) return;
    const now = Date.now(), cooldown = cue === 'key' ? 25 : cue === 'count' ? 65 : 40;
    if (now - (this.lastCue.get(cue) ?? -Infinity) < cooldown) return;
    this.lastCue.set(cue, now);
    const asset = this.choose(cue);
    this.playAsset(asset, gain, false, owner);
    if (['win', 'unlock', 'level-up', 'summit', 'streak-bonus'].includes(cue)) this.duck(asset.duration);
  }

  voice(character: string, emotion: Emotion, gain = 1, owner?: SoundScope) {
    if (!this.canPlay(owner)) return;
    const asset = (this.bank.voices[character] ?? this.bank.voices.mochi)[emotion];
    for (const entry of this.entries.values()) if (entry.busy && entry.vocal) this.stopEntry(entry);
    this.playAsset(asset, gain, true, owner);
    this.duck(asset.duration);
  }

  sequence(events: SoundEvent[], owner?: SoundScope): () => void {
    if (!this.canPlay(owner)) return noop;
    const epoch = this.routeGeneration;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cancel = () => { timers.forEach(clearTimeout); this.sequences.delete(cancel); owner?.pending.delete(cancel); };
    this.sequences.add(cancel); owner?.pending.add(cancel);
    for (const event of events) {
      if ('cue' in event) this.entry(this.bank.effects[event.cue][this.variants.get(event.cue) ?? 0]);
      else this.entry((this.bank.voices[event.character] ?? this.bank.voices.mochi)[event.voice]);
      const run = () => {
        if (epoch !== this.routeGeneration || !this.canPlay(owner)) return;
        if ('cue' in event) this.play(event.cue, event.gain, owner);
        else this.voice(event.character, event.voice, event.gain, owner);
      };
      if (!event.at) run(); else timers.push(setTimeout(run, event.at));
    }
    timers.push(setTimeout(cancel, Math.max(0, ...events.map(e => e.at ?? 0)) + 10));
    return cancel;
  }

  cancelOwner(owner: SoundScope) {
    for (const cancel of owner.pending) cancel();
    for (const entry of this.entries.values()) if (entry.owner === owner) this.stopEntry(entry);
  }

  private canPlay(owner?: SoundScope) { return this.running && this.foreground && this.effectsOn && (!owner || owner.active); }
  private choose(cue: Cue) {
    const takes = this.bank.effects[cue], index = this.variants.get(cue) ?? 0;
    this.variants.set(cue, (index + 1) % takes.length);
    return takes[index];
  }
  private entry(asset: SoundAsset): Entry | undefined {
    const existing = this.entries.get(asset.id);
    if (existing) { existing.used = Date.now(); return existing; }
    if (this.entries.size >= MIX.maxPlayers) {
      const oldest = [...this.entries.values()].filter(e => !e.busy).sort((a, b) => a.used - b.used)[0];
      if (!oldest) return;
      safely(() => oldest.player.remove()); this.entries.delete(oldest.asset.id);
    }
    try {
      const player = this.backend.create(asset);
      const entry: Entry = { asset, player, used: Date.now(), token: 0, busy: false, vocal: false };
      this.entries.set(asset.id, entry);
      player.onEnd(() => { entry.busy = false; });
      void player.ready.catch(() => { if (this.entries.get(asset.id) === entry) { this.stopEntry(entry); safely(() => player.remove()); this.entries.delete(asset.id); } });
      return entry;
    } catch { return; }
  }
  private playAsset(asset: SoundAsset, gain: number, vocal: boolean, owner?: SoundScope) {
    const entry = this.entry(asset); if (!entry) return;
    const busy = [...this.entries.values()].filter(e => e.busy && e !== entry);
    if (busy.length >= MIX.maxLayers) this.stopEntry(busy.sort((a, b) => Number(a.vocal) - Number(b.vocal) || a.used - b.used)[0]);
    this.stopEntry(entry);
    entry.busy = true; entry.owner = owner; entry.vocal = vocal;
    const token = ++entry.token, generation = this.generation, due = Date.now();
    const valid = () => this.canPlay(owner) && token === entry.token && generation === this.generation && Date.now() - due < 250;
    void entry.player.ready.then(async () => {
      if (!valid()) { if (entry.token === token) entry.busy = false; return; }
      await entry.player.rewind();
      if (!valid()) { if (entry.token === token) entry.busy = false; return; }
      entry.player.volume = (vocal ? MIX.voices : MIX.effects) * Math.min(1, Math.max(0, gain));
      entry.player.play();
    }).catch(() => { if (entry.token === token) entry.busy = false; });
  }
  private stopEntry(entry: Entry) { entry.token++; entry.busy = false; safely(() => entry.player.pause()); }
  private cancelScenes() {
    for (const cancel of this.sequences) cancel();
    for (const entry of this.entries.values()) if (entry.owner || entry.vocal) this.stopEntry(entry);
    this.duckUntil = 0; clearTimeout(this.duckTimer); this.fadeMusic(MIX.music);
  }
  private stopEffects() {
    this.routeGeneration++; this.cancelScenes(); this.lastCue.clear();
    for (const entry of this.entries.values()) this.stopEntry(entry);
  }

  private prepareMusic() {
    if (!this.running || this.musicPlayer) return;
    try {
      const player = this.backend.create(this.bank.music[this.track]); this.musicPlayer = player;
      player.volume = 0;
      // A failed load drops the player; the next touch or foregrounding builds a fresh one.
      void player.ready.catch(() => { if (this.musicPlayer === player) { this.musicPlaying = false; this.musicSent = 0; this.musicPlayer = undefined; safely(() => player.remove()); } });
      player.onEnd(() => {
        if (this.musicPlayer !== player) return;
        this.musicPlayer = undefined; this.musicPlaying = false; this.musicSent = 0; safely(() => player.remove());
        this.track = (this.track + 1) % this.bank.music.length;
        // Breathing room between complete compositions, never a repeating beat loop.
        this.nextTrack = setTimeout(() => { this.nextTrack = undefined; this.prepareMusic(); this.startMusic(); }, 4000);
      });
    } catch { /* The game still runs if the platform's audio is unavailable. */ }
  }
  private startMusic() {
    if (!this.running || !this.foreground || !this.musicOn || !this.unlocked || this.nextTrack) return;
    if (this.musicPlaying && !this.musicStalled()) return;
    this.prepareMusic(); const player = this.musicPlayer; if (!player) return;
    const request = ++this.musicRequest;
    this.musicPlaying = true;
    void player.ready.then(() => {
      if (request !== this.musicRequest || this.musicPlayer !== player || !this.foreground || !this.musicOn || !this.running) return;
      player.volume = 0; player.play(); this.musicSent = Date.now();
      this.fadeMusic(this.duckUntil > Date.now() ? MIX.duckedMusic : MIX.music);
    }).catch(() => { if (request === this.musicRequest) this.musicPlaying = false; });
  }
  /** iOS pauses players itself (interruptions, route changes, an idle session) without telling JS. A touch or foregrounding restarts them. */
  private musicStalled() {
    if (!this.musicSent || Date.now() - this.musicSent < 1000) return false;
    try { return !this.musicPlayer?.playing; } catch { return true; }
  }
  private pauseMusic() {
    this.musicRequest++; this.musicPlaying = false; this.musicSent = 0;
    clearTimeout(this.nextTrack); this.nextTrack = undefined; clearInterval(this.fadeTimer);
    if (this.musicPlayer) safely(() => this.musicPlayer?.pause());
  }
  private fadeMusic(target: number) {
    clearInterval(this.fadeTimer);
    if (!this.musicPlayer || !this.musicPlaying) return;
    const player = this.musicPlayer, from = player.volume; let step = 0;
    this.fadeTimer = setInterval(() => {
      safely(() => { player.volume = from + (target - from) * ++step / 8; });
      if (step >= 8) clearInterval(this.fadeTimer);
    }, 40);
  }
  private duck(seconds: number) {
    this.duckUntil = Math.max(this.duckUntil, Date.now() + seconds * 1000 + 150);
    this.fadeMusic(MIX.duckedMusic); clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => this.fadeMusic(MIX.music), this.duckUntil - Date.now());
  }
  dispose() {
    this.running = false; this.generation++; this.stopEffects(); this.pauseMusic();
    for (const entry of this.entries.values()) safely(() => entry.player.remove());
    this.entries.clear(); safely(() => this.musicPlayer?.remove()); this.musicPlayer = undefined;
  }
}

export class SoundScope {
  active = false;
  private revision = 0;
  readonly pending = new Set<() => void>();
  constructor(private engine: SoundEngine) {}
  activate = () => { this.active = true; };
  /** Async completions must still belong to the same visible, uninterrupted scene. */
  continuation() { const revision = this.revision, epoch = this.engine.sceneVersion; return () => this.active && revision === this.revision && epoch === this.engine.sceneVersion; }
  play(cue: Cue, gain = 1) { if (this.active) this.engine.play(cue, gain, this); }
  voice(character: string, emotion: Emotion, gain = 1) { if (this.active) this.engine.voice(character, emotion, gain, this); }
  sequence(events: SoundEvent[]) { return this.active ? this.engine.sequence(events, this) : noop; }
  cancel = () => this.engine.cancelOwner(this);
  deactivate = () => { this.active = false; this.revision++; this.cancel(); };
}
