/*
 * The level path's world is drawn by the SAME code as the design preview:
 * design/world/world.js (terraces, cliffs, trees, the castle). Like the
 * character rig, it's a plain script that attaches `HangedWorld` to the global
 * object and returns SVG strings. Change the world there, not here.
 *
 * The world is drawn in bands (one Svg per BAND points of height): a 20-level
 * path would be one bitmap about 2,400 pt tall, and bands scrolled off screen
 * can be dropped. Each band only gets the pieces it shows, and is parsed once
 * and kept (`worldBands`), so opening the map again costs nothing.
 */
import '../../design/world/world.js';
import { parse } from 'react-native-svg';

export interface Point {
  x: number;
  y: number;
}

export interface WorldLayout {
  width: number;
  height: number;
  /** Room over the last stop. */
  above: number;
  /** Stops drawn: levels 1…count. */
  count: number;
  stops: Point[];
  /** Where the next stop would be, deep in the fog. Never drawn with its number. */
  hidden: Point;
  /** There are levels past the last stop: the fog hides them. Without it, the castle stands at the top. */
  more: boolean;
}

/** One cloud of the fog: its box, how far it sways, and whether it has the flat shadow. */
export interface FogSpot {
  left: number;
  top: number;
  w: number;
  drift: number;
  opacity: number;
  shade: boolean;
}

interface Art {
  defs: string;
  pieces: { y0: number; y1: number; svg: string }[];
}

interface HangedWorldApi {
  COLORS: Record<'mist' | 'cloudShade' | 'leaf' | 'leafL', string>;
  STEP: number;
  NODE: number;
  ROAD_W: number;
  ROAD_DASH: string;
  layout(width: number, below: number, above: number, shown: number, levels: number): WorldLayout;
  curve(a: Point, b: Point): string;
  bezier(a: Point, b: Point, s: number): Point;
  art(layout: WorldLayout, id: string): Art;
  slice(layout: WorldLayout, art: Art, id: string, top: number, height: number): string;
  cloudSpots(layout: WorldLayout): FogSpot[];
  farMountain(layout: WorldLayout, id: string): string;
  /** A crown `w` wide (28 × 22 box), top-left at (x − w/2, y). */
  crown(x: number, y: number, w: number, fill?: string, edge?: string): string;
}

export const HangedWorld = (globalThis as unknown as { HangedWorld: HangedWorldApi }).HangedWorld;

const BAND = 512;
/** Layouts kept parsed: the map and the level-up card, at a couple of levels. */
const KEEP = 6;

export interface WorldBand {
  top: number;
  ast: ReturnType<typeof parse>;
}

const bandCache = new Map<string, WorldBand[]>();

function parseBand(xml: string) {
  try {
    return parse(xml);
  } catch {
    // A band that fails to parse is left empty rather than taking the screen down
    return null;
  }
}

/** The world for `layout`, as parsed bands from top to bottom. `id` prefixes its gradients. */
export function worldBands(layout: WorldLayout, id: string): WorldBand[] {
  // The layout is fully set by these (the stops follow from them)
  const key = `${id}|${layout.width}|${layout.height}|${layout.above}|${layout.count}|${layout.more}`;
  const hit = bandCache.get(key);
  if (hit) {
    bandCache.delete(key);
    bandCache.set(key, hit);
    return hit;
  }
  const art = HangedWorld.art(layout, id);
  const bands: WorldBand[] = [];
  for (let top = 0; top < layout.height; top += BAND) {
    bands.push({ top, ast: parseBand(HangedWorld.slice(layout, art, id, top, Math.min(BAND, layout.height - top))) });
  }
  bandCache.set(key, bands);
  if (bandCache.size > KEEP) bandCache.delete(bandCache.keys().next().value!);
  return bands;
}
