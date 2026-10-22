/*
 * Level up / level down (owner's idea, not in the mockup): a card over the
 * round result showing the level path, a winding road of numbered stops with
 * one colour per level (theme.levelColors). The player's character hops up to
 * the next stop or slides back down to the one before, the camera following
 * it, while the road fills or empties behind it. The path (LevelPath) stops at
 * the highest level reached; past it is fog. When it lands, the stop pops
 * (with sparkles going up) and `onLanded` lets the header show the new level.
 * The card has no button: it lingers a moment, then fades out by itself.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Character } from '../characters/rig';
import { feedback } from '../feedback';
import { t } from '../i18n';
import { colors, fonts, levelColor, worldColors } from '../theme';
import { Avatar } from './GameHeader';
import {
  bezier,
  curve,
  curveLength,
  LevelStop,
  MARKER,
  MARKER_BOX,
  MARKER_LIFT,
  NODE,
  PathFog,
  pathLayout,
  PathWorld,
  ROAD,
  ROAD_DASHES,
} from './LevelPath';
import { popFrom } from './motion';
import { Raised } from './Raised';
import { SparkBurst } from './SparkBurst';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The card waits for the result to settle and the token flight to land. */
const APPEAR_MS = 1100;
const SHOW_MS = 280;
/** Card shown → the character sets off. */
const START_MS = 450;
const TRAVEL_MS = { up: 950, down: 1150 };
/** Landed → the card fades out by itself, so the stop's pop and sparkles play out first. */
const HOLD_MS = 1300;
const HIDE_MS = 220;
const SAMPLES = 8;

/**
 * The path up to the `best` level reached, and the character's trip on it,
 * for a card `width` wide and `viewH` tall.
 */
function geometry(width: number, viewH: number, from: number, to: number, best: number) {
  const edge = viewH / 2;
  const layout = pathLayout(width, edge, edge, Math.max(best, from, to));
  const { stops } = layout;
  const up = to > from;
  const lo = Math.min(from, to) - 1;
  const hi = Math.max(from, to) - 1;

  // The character travels the stretches between the two stops; s = 0 at `from`, 1 at `to`
  const along = (s: number) => {
    const pos = (up ? s : 1 - s) * (hi - lo);
    const i = Math.min(Math.floor(pos), hi - lo - 1);
    return bezier(stops[lo + i], stops[lo + i + 1], pos - i);
  };
  const inputRange = Array.from({ length: SAMPLES + 1 }, (_, k) => k / SAMPLES);
  const pts = inputRange.map(along);
  const moving = Array.from({ length: hi - lo }, (_, k) => lo + k);

  return {
    layout,
    /** Stretches reached both before and after the change. */
    done: lo,
    /** The stretch (or stretches) that fills going up and empties going down. */
    moving: {
      d: moving.map((i) => curve(stops[i], stops[i + 1])).join(''),
      color: levelColor(hi + 1).main,
      length: moving.reduce((sum, i) => sum + curveLength(stops[i], stops[i + 1]), 0),
      // Drawn in its own small Svg over the world, just around these stretches
      top: stops[hi].y - ROAD,
      height: stops[lo].y - stops[hi].y + 2 * ROAD,
    },
    inputRange,
    markerX: pts.map((p) => p.x - MARKER_BOX / 2),
    markerY: pts.map((p) => p.y - MARKER_LIFT - MARKER_BOX / 2),
    // Keep the character (and the stop under it) in the middle of the window
    camera: pts.map((p) => edge - (p.y - MARKER_LIFT / 2)),
  };
}

interface Props {
  from: number;
  to: number;
  /** The highest level ever reached: the path shows every stop up to it, then fog. */
  best: number;
  character: Character;
  width: number;
  compact: boolean;
  onLanded: () => void;
  /** After the card has faded out by itself. The Play screen unmounts it here. */
  onClose: () => void;
}

export function LevelChange({ from, to, best, character, width, compact, onLanded, onClose }: Props) {
  const up = to > from;
  const cardW = Math.min(width, 360);
  const pathW = cardW - 32;
  const viewH = compact ? 220 : 280;
  const geo = useMemo(() => geometry(pathW, viewH, from, to, best), [pathW, viewH, from, to, best]);
  const [fx] = useState(() => ({
    show: new Animated.Value(0),
    travel: new Animated.Value(0),
    // SVG props can't use the native driver, so the road has its own value
    fill: new Animated.Value(up ? 0 : 1),
    land: new Animated.Value(1),
    burst: new Animated.Value(1),
  }));
  const [open, setOpen] = useState(false);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setOpen(true), APPEAR_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const travel = { duration: TRAVEL_MS[up ? 'up' : 'down'], easing: Easing.inOut(Easing.cubic) };
    const run = Animated.sequence([
      Animated.timing(fx.show, { toValue: 1, duration: SHOW_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(START_MS),
      Animated.timing(fx.travel, { toValue: 1, ...travel, useNativeDriver: true }),
    ]);
    const road = Animated.timing(fx.fill, { toValue: up ? 1 : 0, delay: SHOW_MS + START_MS, ...travel, useNativeDriver: false });
    run.start(({ finished }) => {
      if (!finished) return;
      setLanded(true);
      popFrom(fx.land, up ? 0.5 : 0.8);
      if (up) {
        fx.burst.setValue(0);
        Animated.timing(fx.burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        feedback.levelUp();
      } else feedback.levelDown();
    });
    road.start();
    return () => {
      run.stop();
      road.stop();
    };
  }, [open, up, fx]);

  useEffect(() => {
    if (!landed) return;
    onLanded();
    const hide = Animated.timing(fx.show, { toValue: 0, duration: HIDE_MS, delay: HOLD_MS, useNativeDriver: true });
    hide.start(({ finished }) => finished && onClose());
    return () => hide.stop();
  }, [landed, onLanded, onClose, fx]);

  if (!open) return null;
  const at = (input: number[]) => fx.travel.interpolate({ inputRange: geo.inputRange, outputRange: input });
  const hop = fx.travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, up ? -26 : -10, 0] });
  const tilt = fx.travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', up ? '8deg' : '-12deg', '0deg'] });
  const current = landed ? to : from;
  const c = levelColor(to);
  const word = up ? 'up' : 'down';

  return (
    <Animated.View style={[styles.backdrop, { opacity: fx.show }]} accessibilityViewIsModal>
      <Animated.View style={{ transform: [{ scale: fx.show.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
        <Raised depth={6} shadowColor={colors.shadow} radius={28} style={[styles.card, { width: cardW }]}>
          <Text style={[styles.title, { color: c.dark }]}>{t(`level.${word}.title`, { level: to })}</Text>
          <Text style={styles.body}>{t(`level.${word}.body`, { level: to })}</Text>
          <View
            style={[styles.window, { height: viewH }]}
            accessible
            accessibilityLabel={t('level.a11y.path', { from, to })}
          >
            <Animated.View style={{ width: pathW, height: geo.layout.height, transform: [{ translateY: at(geo.camera) }] }}>
              <PathWorld id="levelChangeWorld" layout={geo.layout} filled={geo.done} />
              <Svg
                width={pathW}
                height={geo.moving.height}
                viewBox={`0 ${geo.moving.top} ${pathW} ${geo.moving.height}`}
                style={[styles.moving, { top: geo.moving.top }]}
              >
                <AnimatedPath
                  d={geo.moving.d}
                  stroke={geo.moving.color}
                  strokeWidth={ROAD}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={[geo.moving.length, geo.moving.length]}
                  strokeDashoffset={fx.fill.interpolate({ inputRange: [0, 1], outputRange: [geo.moving.length, 0] })}
                />
                <Path d={geo.moving.d} {...ROAD_DASHES} />
              </Svg>
              {geo.layout.stops.map((p, i) => {
                const level = i + 1;
                const target = level === to;
                return (
                  <Animated.View
                    key={level}
                    style={[styles.stop, { left: p.x - NODE / 2, top: p.y - NODE / 2 }, target && { transform: [{ scale: fx.land }] }]}
                  >
                    <LevelStop level={level} reached={level <= current} />
                    {target && up && <SparkBurst burst={fx.burst} reach={44} size={16} />}
                  </Animated.View>
                );
              })}
              <PathFog id="levelChangeFog" layout={geo.layout} />
              <Animated.View
                style={[
                  styles.marker,
                  { transform: [{ translateX: at(geo.markerX) }, { translateY: Animated.add(at(geo.markerY), hop) }, { rotate: tilt }] },
                ]}
              >
                <Avatar character={character} size={MARKER} />
              </Animated.View>
            </Animated.View>
          </View>
        </Raised>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // iOS turns zIndex into a layer depth that ignores stacking order: the result's
  // stamp (zIndex 2) drew over this card on a phone, so the card needs a higher one
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    backgroundColor: 'rgba(75,58,53,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, padding: 16 },
  title: { fontFamily: fonts.display700, fontSize: 30, textAlign: 'center' },
  body: { fontFamily: fonts.body800, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 2 },
  window: { marginTop: 12, borderRadius: 20, overflow: 'hidden', backgroundColor: worldColors.mist },
  moving: { position: 'absolute', left: 0 },
  stop: { position: 'absolute', width: NODE, height: NODE },
  marker: { position: 'absolute', left: 0, top: 0 },
});
