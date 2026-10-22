/*
 * The level path, shared by the level-up card (LevelChange) and the level map
 * (LevelMap): a winding road of numbered stops, level 1 at the bottom, one
 * colour per level (theme.levelColors), climbing terraces over a sea of clouds
 * towards a castle. The world itself (cliffs, trees, the castle) is drawn by
 * design/world/world.js, the same code as the design preview (src/world).
 * Only the levels the player has reached are drawn. Past the highest one a
 * plank bridge runs into fog (owner's call), so the player never learns how
 * many levels there are; only the castle's mountain shows, far away. On the
 * top level the fog is gone and the castle stands behind the last stop.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, SvgAst, SvgXml } from 'react-native-svg';

import { LEVELS } from '../game/levels';
import { colors, fonts, levelColor, worldColors as W } from '../theme';
import { HangedWorld, Point, WorldLayout, worldBands } from '../world/world';
import { cloudXml, fogCloudXml, Icon } from './icons';
import { Raised } from './Raised';

export const NODE = HangedWorld.NODE;
/** The character's avatar, ring included (GameHeader's Avatar adds 5). */
export const MARKER = 38;
export const MARKER_BOX = MARKER + 5;
/** The character stands on its stop: its centre is this far above the stop's. */
export const MARKER_LIFT = 37;
export const ROAD = HangedWorld.ROAD_W;
/** The white dashes down the middle of the road. Every stretch is its own subpath, so they restart at each stop. */
export const ROAD_DASHES = { stroke: '#fff', strokeOpacity: 0.85, strokeWidth: 2.5, strokeDasharray: HangedWorld.ROAD_DASH, strokeLinecap: 'round', fill: 'none' } as const;
const DRIFT_MS = 4200;
const FOG_CLOUD = fogCloudXml(W.cloudShade);
// Same size as FOG_CLOUD (100 × 54) with no shadow: the bank's back rows, whose flat shadows would draw a hard line
const BANK_CLOUD = cloudXml().replace('0 0 100 50', '0 0 100 54');

/** Each stretch of road is an S-curve: it leaves a stop straight up and enters the next straight up. */
export const curve = HangedWorld.curve;
export const bezier = HangedWorld.bezier;

export function curveLength(a: Point, b: Point) {
  let len = 0;
  for (let i = 1, p = a; i <= 16; i++) {
    const q = bezier(a, b, i / 16);
    len += Math.hypot(q.x - p.x, q.y - p.y);
    p = q;
  }
  return len;
}

export type PathLayout = WorldLayout;

/**
 * The stops of levels 1…`shown` on a path `width` wide, with `below` of room
 * under level 1 and `above` over the last stop (the fog, or the castle on the
 * top level), so either end can be brought to the same point of a window.
 */
export const pathLayout = (width: number, below: number, above: number, shown: number): PathLayout =>
  HangedWorld.layout(width, below, above, shown, LEVELS.length);

/** A stop: a glossy button in its level's colour (the world draws the stone ring under it). Pale and dashed when not reached. */
export const LevelStop = memo(function LevelStop({ level, reached }: { level: number; reached: boolean }) {
  const c = levelColor(level);
  return reached ? (
    <Raised depth={5} shadowColor={c.dark} radius={NODE / 2} style={[styles.face, { backgroundColor: c.main }]}>
      <View style={styles.gloss} />
      <Text style={[styles.num, { textShadowColor: c.dark }]}>{level}</Text>
    </Raised>
  ) : (
    <View style={[styles.face, styles.ahead, { backgroundColor: c.light, borderColor: c.main }]}>
      <Text style={[styles.num, styles.aheadNum, { color: c.main }]}>{level}</Text>
    </View>
  );
});

/** The world under the stops. Static: drawn once, in bands, and kept parsed (src/world). `id` prefixes its gradients. */
export const PathWorld = memo(function PathWorld({ id, layout }: { id: string; layout: PathLayout }) {
  const bands = useMemo(() => worldBands(layout, id), [layout, id]);
  return (
    <>
      {bands.map((b) => (
        <SvgAst key={b.top} ast={b.ast} override={{ style: [styles.band, { top: b.top }] }} />
      ))}
    </>
  );
});

/**
 * The fog over everything past the last stop: mist thickening over the sky,
 * the castle's mountain far away above it, slowly drifting clouds (a thick bank
 * where the plank bridge goes in), and a dim "?" stop where the next level
 * would be (never its number). Drawn after the stops and before the character,
 * so the character stays in front. `id` names its gradients (each Svg needs its own).
 * On the top level there's nothing past the last stop: the level map leaves the fog
 * out, and the level-up card to the top lifts it (fades it out).
 */
export const PathFog = memo(function PathFog({ id, layout }: { id: string; layout: PathLayout }) {
  const top = layout.stops[layout.stops.length - 1];
  const fogH = top.y - NODE / 2 - 4;
  const [drift] = useState(() => new Animated.Value(0));
  const spots = useMemo(() => HangedWorld.cloudSpots(layout), [layout]);
  const mountain = useMemo(() => (layout.more ? HangedWorld.farMountain(layout, `${id}Far`) : null), [layout, id]);

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
            <Stop offset="0" stopColor={W.mist} stopOpacity={0.92} />
            <Stop offset="0.55" stopColor={W.mist} stopOpacity={0.82} />
            <Stop offset="1" stopColor={W.mist} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={layout.width} height={fogH} fill={`url(#${id})`} />
      </Svg>
      {mountain && <SvgXml xml={mountain} style={styles.fogTop} />}
      {spots.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.cloud,
            { left: s.left, top: s.top, opacity: s.opacity },
            { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-s.drift, s.drift] }) }] },
          ]}
        >
          <Icon xml={s.shade ? FOG_CLOUD : BANK_CLOUD} size={s.w} height={s.w * 0.54} />
        </Animated.View>
      ))}
      {layout.more && (
        <View style={[styles.face, styles.ahead, styles.unknown, { left: layout.hidden.x - NODE / 2, top: layout.hidden.y - NODE / 2 }]}>
          <Text style={[styles.num, styles.aheadNum, { color: colors.muted }]}>?</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  face: { width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' },
  // The button's shine, top left
  gloss: { position: 'absolute', top: 5, left: 9, width: 22, height: 11, borderRadius: 6, backgroundColor: '#fff', opacity: 0.32 },
  ahead: { borderRadius: NODE / 2, borderWidth: 2.5, borderStyle: 'dashed' },
  unknown: { position: 'absolute', backgroundColor: colors.paper, borderColor: colors.xMark, opacity: 0.7 },
  num: { fontFamily: fonts.display700, fontSize: 22, color: '#fff', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 1 },
  aheadNum: { textShadowRadius: 0, textShadowOffset: { width: 0, height: 0 } },
  band: { position: 'absolute', left: 0 },
  fogTop: { position: 'absolute', top: 0, left: 0 },
  cloud: { position: 'absolute' },
});
