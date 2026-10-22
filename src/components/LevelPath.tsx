/*
 * The level path, shared by the level-up card (LevelChange) and the level map
 * (LevelMap): a winding road of numbered stops, level 1 at the bottom, one
 * colour per level (theme.levelColors), climbing a little world: a sky that
 * deepens as you go up, a grassy hill with cliff edges, floating islands with
 * waterfalls, a stone pedestal under every stop. Only the levels the player has
 * reached are drawn. Past the highest one a rope bridge runs into fog (owner's
 * call), so the player never learns how many levels there are or what's next.
 */
import { memo, ReactElement, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { LEVELS } from '../game/levels';
import { colors, fonts, levelColor, worldColors as W } from '../theme';
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
/** The white dashes down the middle of the road. Every stretch is its own subpath, so they restart at each stop. */
export const ROAD_DASHES = { stroke: '#fff', strokeOpacity: 0.75, strokeWidth: 2.5, strokeDasharray: '2 9', strokeLinecap: 'round', fill: 'none' } as const;
/** The grassy hill under the road. */
const RIBBON = 118;
/** The world is drawn in bands this tall: one huge Svg would be one huge bitmap, bands off screen can be dropped. */
const BAND = 512;
const CLOUD_W = 104;
/** Rows of clouds packed into the bank where the road enters the fog. */
const BANK_ROWS = 3;
const DRIFT_MS = 4200;
const FOG_CLOUD = fogCloudXml(W.cloudShade);
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
 * The stops of levels 1…`shown` on a path `width` wide, with `below` of room
 * under level 1 and `above` over the last stop (the fog), so either end can be
 * brought to the same point of a window.
 */
export function pathLayout(width: number, below: number, above: number, shown: number) {
  const count = Math.min(LEVELS.length, Math.max(1, shown));
  const height = (count - 1) * STEP + below + above;
  const amp = Math.min(width * 0.26, width / 2 - NODE, 120);
  const at = (i: number): Point => ({ x: width / 2 + amp * Math.sin(i * 1.25), y: height - below - i * STEP });
  const stops = Array.from({ length: count }, (_, i) => at(i));
  return {
    width,
    height,
    stops,
    /** Where the next stop would be, deep in the fog. Never drawn with its number. */
    hidden: at(count),
    /** There are levels past the last stop shown: the fog hides one. */
    more: count < LEVELS.length,
    /** The stretch from stop i to i + 1, in the colour of the level it reaches. */
    stretches: stops.slice(1).map((p, i) => ({ d: curve(stops[i], p), color: levelColor(i + 2).main })),
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

/** A repeatable 0…1 number for decoration `n`, so the world looks the same on every visit. */
const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const bush = (key: string, x: number, y: number, r: number) => (
  <G key={key}>
    <Circle cx={x - r * 0.7} cy={y} r={r * 0.75} fill={W.bush} />
    <Circle cx={x + r * 0.7} cy={y} r={r * 0.75} fill={W.bush} />
    <Circle cx={x} cy={y - r * 0.45} r={r} fill={W.bush} />
    <Circle cx={x - r * 0.3} cy={y - r * 0.7} r={r * 0.38} fill={W.bushL} />
  </G>
);

const flower = (key: string, x: number, y: number) => (
  <G key={key}>
    <Circle cx={x} cy={y} r={3.4} fill="#fff" />
    <Circle cx={x} cy={y} r={1.5} fill={colors.butter} />
  </G>
);

/** icons.cloudXml's shape, `w` wide, centred on x with its flat bottom on y. */
const cloud = (key: string, x: number, y: number, w: number, opacity: number) => {
  const k = w / 100;
  return (
    <G key={key} opacity={opacity} fill="#fff">
      <Circle cx={x - 22 * k} cy={y - 15 * k} r={15 * k} />
      <Circle cx={x - 2 * k} cy={y - 25 * k} r={19 * k} />
      <Circle cx={x + 20 * k} cy={y - 18 * k} r={15 * k} />
      <Rect x={x - 36 * k} y={y - 17 * k} width={72 * k} height={17 * k} rx={8.5 * k} />
    </G>
  );
};

/** A floating island in the distance: grass on top, a cliff narrowing to a point, maybe a waterfall spilling off. */
function island(key: string, x: number, y: number, s: number, falls: boolean, fallId: string) {
  const w = 110 * s;
  const h = 64 * s;
  const body = (l: number, r: number) =>
    `M${l} ${y}C${l} ${y + h * 0.55} ${x - w * 0.12} ${y + h * 0.8} ${x} ${y + h}C${x + w * 0.12} ${y + h * 0.8} ${r} ${y + h * 0.55} ${r} ${y}Z`;
  return (
    <G key={key} opacity={0.9}>
      <Path d={body(x - w / 2, x + w / 2)} fill={W.cliff} />
      <Path d={body(x + w * 0.1, x + w / 2)} fill={W.cliffD} opacity={0.5} />
      {falls && <Rect x={x - w * 0.3} y={y} width={10 * s} height={h * 1.7} rx={4 * s} fill={`url(#${fallId})`} />}
      <Rect x={x - w / 2 - 5} y={y - 8 * s} width={w + 10} height={17 * s} rx={8 * s} fill={W.grassD} />
      <Rect x={x - w / 2 - 5} y={y - 12 * s} width={w + 10} height={15 * s} rx={7.5 * s} fill={W.grass} />
      {bush(`${key}b`, x + w * (rand(x) - 0.5) * 0.6, y - 12 * s, 11 * s)}
    </G>
  );
}

/** Everything static in the world, back to front. Built once per layout and shared by every band. */
function worldArt(layout: PathLayout, filled: number, id: string) {
  const { width, height, stops, stretches } = layout;
  const art: ReactElement[] = [<Rect key="sky" width={width} height={height} fill={`url(#${id}Sky)`} />];
  const ground = stops[0].y + 46;

  // Far away: clouds, then floating islands down both sides
  for (let k = 0, y = 70; y < ground - 60; k++, y += 160 + rand(k) * 50) {
    art.push(cloud(`c${k}`, width * (0.15 + rand(k + 50) * 0.7), y, 120 + rand(k + 9) * 60, 0.85));
  }
  for (let k = 0, y = 110; y < ground - 90; k++, y += 135 + rand(k + 20) * 60) {
    const side = k % 2 ? 1 : -1;
    const x = width / 2 + side * width * (0.36 + rand(k + 31) * 0.08);
    art.push(island(`i${k}`, x, y, 0.65 + rand(k + 40) * 0.45, k % 3 === 1, `${id}Fall`));
  }

  // The meadow at the foot of the path
  art.push(
    <Path
      key="ground"
      d={`M0 ${ground}C${width * 0.3} ${ground - 26} ${width * 0.6} ${ground + 14} ${width} ${ground - 8}V${height}H0Z`}
      fill={W.grass}
    />,
    bush('g1', width * 0.1, ground + 34, 16),
    bush('g2', width * 0.9, ground + 22, 19),
    bush('g3', width * 0.28, ground + 92, 13),
    bush('g4', width * 0.74, ground + 110, 15),
    flower('gf1', width * 0.2, ground + 60),
    flower('gf2', width * 0.62, ground + 48),
    flower('gf3', width * 0.84, ground + 80),
    flower('gf4', width * 0.45, ground + 130),
  );

  // The hill the road climbs: a plateau around every stop joined by a ribbon of grass,
  // drawn as the same shapes shifted down for the cliff, then the grass on top
  const ribbon = stretches.map((s) => s.d).join('');
  const hill = (key: string, dy: number, color: string, grow: number) => (
    <G key={key} transform={`translate(0 ${dy})`}>
      {ribbon && <Path d={ribbon} stroke={color} strokeWidth={RIBBON + grow * 2} strokeLinecap="round" fill="none" />}
      {stops.map((p, i) => (
        <Ellipse key={i} cx={p.x} cy={p.y + 6} rx={60 + grow} ry={34 + grow} fill={color} />
      ))}
    </G>
  );
  art.push(hill('cliffD', 40, W.cliffD, 0), hill('cliff', 24, W.cliff, 0), hill('lip', 6, W.grassD, 0), hill('grass', 0, W.grass, 0));
  art.push(hill('grassL', -3, W.grassL, -15));

  // Bushes beside the stops and along the road, flowers by the roadside
  stops.forEach((p, i) => {
    const side = i % 2 ? 1 : -1;
    art.push(bush(`s${i}`, p.x + side * 52, p.y + 24, 10 + rand(i + 60) * 4));
  });
  stretches.forEach((_, i) => {
    const [a, b] = [stops[i], stops[i + 1]];
    const side = i % 2 ? -1 : 1;
    const mid = bezier(a, b, 0.5);
    const [f1, f2] = [bezier(a, b, 0.3), bezier(a, b, 0.72)];
    art.push(bush(`r${i}`, mid.x + side * 50, mid.y + 4, 9 + rand(i + 70) * 4));
    art.push(flower(`f${i}a`, f1.x + 24, f1.y), flower(`f${i}b`, f2.x - 24, f2.y));
  });

  // The road: the dirt track, the stretches reached in their colours, the dashes
  if (ribbon) {
    art.push(<Path key="track" d={ribbon} stroke={colors.track} strokeWidth={ROAD} strokeLinecap="round" fill="none" />);
    stretches.slice(0, filled).forEach((s, i) => {
      art.push(<Path key={`fill${i}`} d={s.d} stroke={s.color} strokeWidth={ROAD} strokeLinecap="round" fill="none" />);
    });
    art.push(<Path key="dashes" d={ribbon} {...ROAD_DASHES} />);
  }

  // A rope bridge from the last stop into the fog
  if (layout.more) {
    const bridge = curve(stops[stops.length - 1], layout.hidden);
    art.push(
      <Path key="ropes" d={bridge} stroke={W.woodD} strokeWidth={15} strokeLinecap="round" fill="none" />,
      <Path key="planks" d={bridge} stroke={W.wood} strokeWidth={11} strokeDasharray="5 3.5" fill="none" />,
    );
  }

  // A stone pedestal under every stop
  stops.forEach((p, i) => {
    art.push(
      <G key={`p${i}`}>
        <Ellipse cx={p.x} cy={p.y + 17} rx={30} ry={11} fill={W.stone} />
        <Ellipse cx={p.x} cy={p.y + 13} rx={29} ry={10} fill={W.stoneL} />
      </G>,
    );
  });
  return art;
}

/**
 * The world under the stops, with the first `filled` stretches of road in their
 * level's colour. Static: drawn once, in bands. `id` prefixes its gradients.
 */
export const PathWorld = memo(function PathWorld({ id, layout, filled }: { id: string; layout: PathLayout; filled: number }) {
  const art = useMemo(() => worldArt(layout, filled, id), [layout, filled, id]);
  const bands = Array.from({ length: Math.ceil(layout.height / BAND) }, (_, i) => i * BAND);
  return (
    <>
      {bands.map((top) => {
        const h = Math.min(BAND, layout.height - top);
        return (
          <Svg key={top} width={layout.width} height={h} viewBox={`0 ${top} ${layout.width} ${h}`} style={[styles.band, { top }]}>
            <Defs>
              <LinearGradient id={`${id}Sky`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={layout.height}>
                <Stop offset="0" stopColor={W.skyTop} />
                <Stop offset="1" stopColor={W.skyBottom} />
              </LinearGradient>
              <LinearGradient id={`${id}Fall`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={W.water} stopOpacity={1} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {art}
          </Svg>
        );
      })}
    </>
  );
});

/**
 * The fog's clouds: a thick bank of overlapping clouds where the road goes in,
 * then sparse, fainter puffs drifting in the mist up to the top of the path.
 * Listed top first, so the lower clouds overlap the ones behind them.
 */
function cloudSpots({ width, hidden }: PathLayout) {
  const spots = [];
  for (let row = 0, y = hidden.y + 12; y > -CLOUD_W / 2; row++) {
    const bank = row < BANK_ROWS;
    const xs = bank ? (row % 2 ? [0.02, 0.36, 0.7, 1.02] : [0.08, 0.38, 0.66, 0.95]) : [row % 2 ? 0.26 : 0.76];
    for (const [k, fx] of xs.entries()) {
      const w = CLOUD_W * (bank ? 1.25 : 1.05) * (1 + ((row + k) % 3) * 0.1);
      // Neighbours drift opposite ways, so the fog breathes instead of sliding
      const drift = ((row + k) % 2 ? 1 : -1) * (5 + ((row * 3 + k) % 4) * 2);
      // Staggered up and down, so the bank's flat cloud bottoms never line up into a hard edge
      const jitter = (((row * 5 + k * 7) % 3) - 1) * 9;
      const xml = bank && row > 0 ? BANK_CLOUD : FOG_CLOUD;
      spots.push({ left: fx * width - w / 2, top: y - w / 4 + jitter, w, drift, opacity: bank ? 1 : 0.6, xml });
    }
    y -= bank ? 30 : 70;
  }
  return spots.reverse();
}

/**
 * The fog over everything past the last stop: mist thickening over the sky,
 * slowly drifting clouds, and a dim "?" stop in the bank where the next level
 * would be (never its number). The rope bridge runs into it.
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
            <Stop offset="0" stopColor={W.mist} stopOpacity={0.94} />
            <Stop offset="0.55" stopColor={W.mist} stopOpacity={0.85} />
            <Stop offset="1" stopColor={W.mist} stopOpacity={0} />
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

const styles = StyleSheet.create({
  face: { width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' },
  ahead: { borderRadius: NODE / 2, borderWidth: 2.5, borderStyle: 'dashed' },
  unknown: { position: 'absolute', backgroundColor: colors.paper, borderColor: colors.xMark, opacity: 0.7 },
  num: { fontFamily: fonts.display700, fontSize: 21, color: '#fff' },
  band: { position: 'absolute', left: 0 },
  fogTop: { position: 'absolute', top: 0, left: 0 },
  cloud: { position: 'absolute' },
});
