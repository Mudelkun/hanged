export interface SoundAsset { id: string; source: number; duration: number }
export interface SoundPlayer {
  ready: Promise<void>;
  volume: number;
  /** What the platform is really doing: iOS can pause a player without telling JS. */
  readonly playing: boolean;
  play(): void;
  pause(): void;
  rewind(): Promise<void>;
  remove(): void;
  onEnd(callback: () => void): () => void;
}
export interface AudioBackend {
  configure(): Promise<void>;
  unlock(): void;
  create(asset: SoundAsset): SoundPlayer;
}
