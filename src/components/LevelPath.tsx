/*
 * The level path, shared by the level-up card (LevelChange) and the level map
 * (LevelMap): a winding road of numbered stops, level 1 at the bottom, one
 * colour per level (theme.levelColors). Only the levels the player has reached
 * are drawn. Above the highest one the road runs into fog (owner's call), so the
 * player never learns how many levels there are or what the next one is.
 */
import { memo, ReactNode, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { LEVELS } from '../game/levels';
import { colors, fonts, levelColor } from '../theme';
import { cloudXml, fogCloudXml, Icon } from './icons';
import { Raised } from './Raised';

/** Vertical distance between two stops. */
export const STEP = 84;
export const NODE = 46;
/** The character's avatar, ring included (GameHeader's Avatar adds 5). */
export const MARKER = 38;
export const MARKER_BOX = MARKER + 5;
/** The character stands on its stop: its centre is this far above the stop's. */
export const MARKER_LIFT = 37;
export const ROAD = 12;
const FADE = 40;
const CLOUD_W = 104;
/** Rows of clouds packed into the bank where the road enters the fog. */
const BANK_ROWS = 3;
const DRIFT_MS = 4200;
const FOG_CLOUD = fogCloudXml(colors.line);
// Same size as FOG_CLOUD (100 × 54) with no shadow: the bank's back rows, whose flat shadows would draw a hard line
const BANK_CLOUD = cloudXml().replace('0 0 100 50', '0 0 100 54');

export interface Point {
  x: number;
  y: number;
}

// Each stretch of road is an S-curve: it leaves a stop straight up and enters the next straight up.
export const curve = (a: Point, b: Point) => `M${a.x} ${a.y}C${a.x} ${a.y - STEP / 2} ${b.x} ${b.y + STEP / 2} ${b.x} ${b.y}`;

export function bezier(a: Point, b: Point, s: number): Point {
  const u = 1 - s;
  const [k0, k1, k2, k3] = [u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s];
  return {
    x: (k0 + k1) * a.x + (k2 + k3) * b.x,
    y: k0 * a.y + k1 * (a.y - STEP / 2) + k2 * (b.y + STEP / 2) + k3 * b.y,
  };
}

export function curveLength(a: Point, b: Point) {
  let len = 0;
  for (let i = 1, p = a; i <= 16; i++) {
    const q = bezier(a, b, i / 16);
    len += Math.hypot(q.x - p.x, q.y - p.y);
    p = q;
  }
  return len;
}

export type PathLayout = ReturnType<typeof pathLayout>;

/**
 * The stops of levels 1…`shown` on a path `width` wide, with `edge` of room
 * under level 1 and over the last stop (the fog), so either end can sit in the
 * middle of a window 2 × `edge` tall.
 */
export function pathLayout(width: number, edge: number, shown: number) {
  const count = Math.min(LEVELS.length, Math.max(1, shown));
  const height = (count - 1) * STEP + 2 * edge;
  const amp = Math.min(width * 0.26, width / 2 - NODE);
  const at = (i: number): Point => ({ x: width / 2 + amp * Math.sin(i * 1.25), y: height - edge - i * STEP });
  const stops = Array.from({ length: count }, (_, i) => at(i));
  const hidden = at(count);
  return {
    width,
    height,
    stops,
    /** Where the next stop would be, deep in the fog. Never drawn with its number. */
    hidden,
    /** There are levels past the last stop shown: the fog hides one. */
    more: count < LEVELS.length,
    /** The stretch from stop i to i + 1, in the colour of the level it reaches. */
    stretches: stops.slice(1).map((p, i) => ({ d: curve(stops[i], p), color: levelColor(i + 2).main })),
    /** The whole road, the stretch into the fog included. */
    road: [...stops.slice(1), hidden].map((p, i) => curve(stops[i], p)).join(''),
  };
}

export const LevelStop = memo(function LevelStop({ level, reached }: { level: number; reached: boolean }) {
  const c = levelColor(level);
  return reached ? (
    <Raised depth={4} shadowColor={c.dark} radius={NODE / 2} style={[styles.face, { backgroundColor: c.main }]}>
      <Text style={styles.num}>{level}</Text>
    </Raised>
  ) : (
    <View style={[styles.face, styles.ahead, { backgroundColor: c.light, borderColor: c.main }]}>
      <Text style={[styles.num, { color: c.main }]}>{level}</Text>
    </View>
  );
});

/**
 * The road under the stops: the pale track, the first `filled` stretches in
 * their level's colour, then `children` (a stretch being filled), then the
 * white dashes on top.
 */
export function PathRoad({ layout, filled, children }: { layout: PathLayout; filled: number; children?: ReactNode }) {
  return (
    <Svg width={layout.width} height={layout.height} style={StyleSheet.absoluteFill}>
      <Path d={layout.road} stroke={colors.track} strokeWidth={ROAD} strokeLinecap="round" fill="none" />
      {layout.stretches.slice(0, filled).map((s) => (
        <Path key={s.d} d={s.d} stroke={s.color} strokeWidth={ROAD} strokeLinecap="round" fill="none" />
      ))}
      {children}
      <Path d={layout.road} stroke="#fff" strokeOpacity={0.75} strokeWidth={2.5} strokeDasharray="2 9" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/**
 * The fog's clouds: a thick bank of overlapping clouds where the road goes in,
 * then sparse, fainter puffs drifting in the mist up to the top of the path.
 * Listed top first, so the lower clouds overlap the ones behind them.
 */
function cloudSpots({ width, hidden }: PathLayout) {
  const spots = [];
  for (let row = 0, y = hidden.y + 30; y > -CLOUD_W / 2; row++) {
    const bank = row < BANK_ROWS;
    const xs = bank ? (row % 2 ? [0.02, 0.36, 0.7, 1.02] : [0.08, 0.38, 0.66, 0.95]) : [row % 2 ? 0.26 : 0.76];
    for (const [k, fx] of xs.entries()) {
      const w = CLOUD_W * (bank ? 1.25 : 1.05) * (1 + ((row + k) % 3) * 0.1);
      // Neighbours drift opposite ways, so the fog breathes instead of sliding
      const drift = ((row + k) % 2 ? 1 : -1) * (5 + ((row * 3 + k) % 4) * 2);
      // Staggered up and down, so the bank's flat cloud bottoms never line up into a hard edge
      const jitter = (((row * 5 + k * 7) % 3) - 1) * 9;
      const xml = bank && row > 0 ? BANK_CLOUD : FOG_CLOUD;
      spots.push({ left: fx * width - w / 2, top: y - w / 4 + jitter, w, drift, opacity: bank ? 1 : 0.5, xml });
    }
    y -= bank ? 30 : 70;
  }
  return spots.reverse();
}

/**
 * The fog over everything past the last stop: paper fading in over the road,
 * slowly drifting clouds, and a dim "?" stop in the bank where the next level
 * would be (never its number).
 * Drawn after the stops and before the character, so the character stays in front.
 * `id` names its gradient (each Svg needs its own).
 */
export const PathFog = memo(function PathFog({ id, layout }: { id: string; layout: PathLayout }) {
  const top = layout.stops[layout.stops.length - 1];
  const fogH = top.y - NODE / 2 - 4;
  const [drift] = useState(() => new Animated.Value(0));
  const spots = useMemo(() => cloudSpots(layout), [layout]);

  useEffect(() => {
    const ease = { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const loop = Animated.loop(
      Animated.sequence([Animated.timing(drift, { toValue: 1, ...ease }), Animated.timing(drift, { toValue: 0, ...ease })]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={layout.width} height={fogH} style={styles.fogTop}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.paper} stopOpacity={1} />
            <Stop offset="0.55" stopColor={colors.paper} stopOpacity={0.94} />
            <Stop offset="1" stopColor={colors.paper} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={layout.width} height={fogH} fill={`url(#${id})`} />
      </Svg>
      {spots.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.cloud,
            { left: s.left, top: s.top, opacity: s.opacity },
            { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-s.drift, s.drift] }) }] },
          ]}
        >
          <Icon xml={s.xml} size={s.w} height={s.w * 0.54} />
        </Animated.View>
      ))}
      {layout.more && (
        <View style={[styles.face, styles.ahead, styles.unknown, { left: layout.hidden.x - NODE / 2, top: layout.hidden.y - NODE / 2 }]}>
          <Text style={[styles.num, { color: colors.muted }]}>?</Text>
        </View>
      )}
    </View>
  );
});

/** A window's soft edge: paper fading out, so the road runs off instead of being cut. Each Svg needs its own gradient id. */
export function EdgeFade({ id, side }: { id: string; side: 'top' | 'bottom' }) {
  return (
    <Svg width="100%" height={FADE} style={side === 'top' ? styles.fadeTop : styles.fadeBottom} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.paper} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.paper} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height={FADE} fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  face: { width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' },
  ahead: { borderRadius: NODE / 2, borderWidth: 2.5, borderStyle: 'dashed' },
  unknown: { position: 'absolute', backgroundColor: colors.paper, borderColor: colors.xMark, opacity: 0.55 },
  num: { fontFamily: fonts.display700, fontSize: 21, color: '#fff' },
  fogTop: { position: 'absolute', top: 0, left: 0 },
  cloud: { position: 'absolute' },
  fadeTop: { position: 'absolute', top: 0, left: 0 },
  fadeBottom: { position: 'absolute', bottom: 0, left: 0, transform: [{ scaleY: -1 }] },
});
