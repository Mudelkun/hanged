export interface SoundAsset { id: string; source: number; duration: number }
export interface SoundPlayer {
  ready: Promise<void>;
  volume: number;
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
