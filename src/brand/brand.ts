/*
 * The brand is drawn by the SAME code as the design preview: design/brand/brand.js
 * (the wordmark, and the loading screen's timeline and frames). Like the character
 * rig, it's a plain script that attaches `HangedBrand` to the global object and
 * returns SVG strings. Change the brand there, not here.
 *
 * Import order matters: brand.js reads HangedRig and BalloonAnim while it loads.
 */
import '../characters/rig';
import '../../design/brand/brand.js';
import type { Character } from '../characters/rig';
import { fonts } from '../theme';

/** Text attributes for the wordmark's SVG: the app's loaded Fredoka faces, by name. */
export interface BrandFonts {
  bold: string;
  semi: string;
}

export interface WordmarkOptions {
  word?: string;
  tagline?: string;
  fonts?: BrandFonts;
  /** Seconds, for the float. */
  t?: number;
  /** 0..1 of the float. */
  bob?: number;
  /** 0..1, or one per letter: 0 = hidden (an empty dashed tile), 1 = shown. */
  reveal?: number | number[];
  /** 0..1: the tagline popping in. */
  pill?: number;
  /** false = the tiles only (BOX_COMPACT). */
  balloons?: boolean;
}

export interface SplashOptions {
  w: number;
  h: number;
  /** The player's buddy, or null for a new player: the word plays alone. */
  character: Character | null;
  word?: string;
  tagline?: string;
  fonts?: BrandFonts;
  /** Reduce Motion's single frame: the word shown and centred, nothing moving. */
  still?: boolean;
}

/** Seconds from the moment the app takes over from the native splash. */
export interface SplashTimeline {
  bg: string;
  start: number;
  step: number;
  flip: number;
  up: [number, number];
  buddy: [number, number];
  exit: number;
  lift: number;
  solved: number;
  fade: [number, number];
  end: number;
  letterAt(i: number): number;
}

/** Where a loading-screen layer is at a moment: its 0, 0 on screen (points), degrees, scale, opacity. */
export interface LayerPos {
  x: number;
  y: number;
  r: number;
  s: number;
  o: number;
}

/** One piece of the loading screen: drawn once, then only moved. */
export interface SplashLayer {
  /** Its drawing around its own 0, 0 (no <svg>). */
  svg: string;
  /** A viewBox that holds the drawing. */
  box: [number, number, number, number];
  /** Points per drawing unit. */
  unit: number;
  /** The largest scale it reaches: draw it that sharp. */
  zoom: number;
  at(t: number): LayerPos;
}

interface HangedBrandApi {
  /** The wordmark's parts, in its own units, centred on 0, 0 (no <svg>). */
  wordmark(opts?: WordmarkOptions): string;
  /** The loading screen at second t, as an <svg> filling a w × h screen. */
  splash(t: number, opts: SplashOptions): string;
  /** The loading screen as layers, back to front. */
  splashLayers(opts: SplashOptions): SplashLayer[];
  SPLASH: SplashTimeline;
  BOX: [number, number, number, number];
  BOX_COMPACT: [number, number, number, number];
}

const g = globalThis as unknown as { HangedBrand: HangedBrandApi };
export const HangedBrand = g.HangedBrand;
export const SPLASH = HangedBrand.SPLASH;

export const BRAND_FONTS: BrandFonts = {
  bold: `font-family="${fonts.display700}"`,
  semi: `font-family="${fonts.display600}"`,
};
