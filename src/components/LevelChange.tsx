/*
 * Level up / level down (owner's idea, not in the mockup): a card over the
 * round result showing the level path, a winding road of numbered stops with
 * one colour per level (theme.levelColors). The player's character hops up to
 * the next stop or slides back down to the one before, the camera following
 * it, while the road fills or empties behind it. When it lands, the stop pops
 * (with sparkles going up) and `onLanded` lets the header show the new level.
 * The card has no button: it lingers a moment, then fades out by itself.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Character } from '../characters/rig';
import { feedback } from '../feedback';
import { LEVELS } from '../game/levels';
import { t } from '../i18n';
import { colors, fonts, levelColor } from '../theme';
import { Avatar } from './GameHeader';
import { popFrom } from './motion';
import { Raised } from './Raised';
import { SparkBurst } from './SparkBurst';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Vertical distance between two stops. */
const STEP = 84;
const NODE = 46;
/** The character's avatar, ring included (GameHeader's Avatar adds 5). */
const MARKER = 38;
const MARKER_BOX = MARKER + 5;
/** The character stands on its stop: its centre is this far above the stop's. */
const MARKER_LIFT = 37;
const ROAD = 12;
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
const FADE = 40;

interface Point {
  x: number;
  y: number;
}

// Each stretch of road is an S-curve: it leaves a stop straight up and enters the next straight up.
const curve = (a: Point, b: Point) => `M${a.x} ${a.y}C${a.x} ${a.y - STEP / 2} ${b.x} ${b.y + STEP / 2} ${b.x} ${b.y}`;

function bezier(a: Point, b: Point, s: number): Point {
  const u = 1 - s;
  const [k0, k1, k2, k3] = [u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s];
  return {
    x: (k0 + k1) * a.x + (k2 + k3) * b.x,
    y: k0 * a.y + k1 * (a.y - STEP / 2) + k2 * (b.y + STEP / 2) + k3 * b.y,
  };
}

function curveLength(a: Point, b: Point) {
  let len = 0;
  for (let i = 1, p = a; i <= 16; i++) {
    const q = bezier(a, b, i / 16);
    len += Math.hypot(q.x - p.x, q.y - p.y);
    p = q;
  }
  return len;
}

/** Everything the path draws, for a card `width` wide and `viewH` tall. Level 1 is at the bottom. */
function geometry(width: number, viewH: number, from: number, to: number) {
  const edge = viewH / 2;
  const height = (LEVELS.length - 1) * STEP + 2 * edge;
  const amp = Math.min(width * 0.26, width / 2 - NODE);
  const stops = LEVELS.map((_, i) => ({ x: width / 2 + amp * Math.sin(i * 1.25), y: height - edge - i * STEP }));
  const up = to > from;
  const lo = Math.min(from, to) - 1;
  const hi = Math.max(from, to) - 1;
  const stretch = (i: number) => ({ d: curve(stops[i], stops[i + 1]), color: levelColor(i + 2).main });

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
    height,
    stops,
    road: stops.slice(1).map((p, i) => curve(stops[i], p)).join(''),
    /** Stretches reached both before and after the change. */
    done: Array.from({ length: lo }, (_, i) => stretch(i)),
    /** The stretch (or stretches) that fills going up and empties going down. */
    moving: {
      d: moving.map((i) => curve(stops[i], stops[i + 1])).join(''),
      color: levelColor(hi + 1).main,
      length: moving.reduce((sum, i) => sum + curveLength(stops[i], stops[i + 1]), 0),
    },
    inputRange,
    markerX: pts.map((p) => p.x - MARKER_BOX / 2),
    markerY: pts.map((p) => p.y - MARKER_LIFT - MARKER_BOX / 2),
    // Keep the character (and the stop under it) in the middle of the window
    camera: pts.map((p) => edge - (p.y - MARKER_LIFT / 2)),
  };
}

const LevelStop = memo(function LevelStop({ level, reached }: { level: number; reached: boolean }) {
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

/** The window's soft edge: paper fading out, so the road runs off instead of being cut. Each Svg needs its own gradient id. */
function Fade({ id, style }: { id: string; style: object }) {
  return (
    <Svg width="100%" height={FADE} style={style} pointerEvents="none">
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

interface Props {
  from: number;
  to: number;
  character: Character;
  width: number;
  compact: boolean;
  onLanded: () => void;
  /** After the card has faded out by itself. The Play screen unmounts it here. */
  onClose: () => void;
}

export function LevelChange({ from, to, character, width, compact, onLanded, onClose }: Props) {
  const up = to > from;
  const cardW = Math.min(width, 360);
  const pathW = cardW - 32;
  const viewH = compact ? 220 : 280;
  const geo = useMemo(() => geometry(pathW, viewH, from, to), [pathW, viewH, from, to]);
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
            <Animated.View style={{ width: pathW, height: geo.height, transform: [{ translateY: at(geo.camera) }] }}>
              <Svg width={pathW} height={geo.height} style={StyleSheet.absoluteFill}>
                <Path d={geo.road} stroke={colors.track} strokeWidth={ROAD} strokeLinecap="round" fill="none" />
                {geo.done.map((s) => (
                  <Path key={s.d} d={s.d} stroke={s.color} strokeWidth={ROAD} strokeLinecap="round" fill="none" />
                ))}
                <AnimatedPath
                  d={geo.moving.d}
                  stroke={geo.moving.color}
                  strokeWidth={ROAD}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={[geo.moving.length, geo.moving.length]}
                  strokeDashoffset={fx.fill.interpolate({ inputRange: [0, 1], outputRange: [geo.moving.length, 0] })}
                />
                <Path d={geo.road} stroke="#fff" strokeOpacity={0.75} strokeWidth={2.5} strokeDasharray="2 9" strokeLinecap="round" fill="none" />
              </Svg>
              {geo.stops.map((p, i) => {
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
              <Animated.View
                style={[
                  styles.marker,
                  { transform: [{ translateX: at(geo.markerX) }, { translateY: Animated.add(at(geo.markerY), hop) }, { rotate: tilt }] },
                ]}
              >
                <Avatar character={character} size={MARKER} />
              </Animated.View>
            </Animated.View>
            <Fade id="levelFadeTop" style={styles.fadeTop} />
            <Fade id="levelFadeBottom" style={styles.fadeBottom} />
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
  window: { marginTop: 12, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.paper },
  stop: { position: 'absolute', width: NODE, height: NODE },
  face: { width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' },
  ahead: { borderRadius: NODE / 2, borderWidth: 2.5, borderStyle: 'dashed' },
  num: { fontFamily: fonts.display700, fontSize: 21, color: '#fff' },
  marker: { position: 'absolute', left: 0, top: 0 },
  fadeTop: { position: 'absolute', top: 0, left: 0 },
  fadeBottom: { position: 'absolute', bottom: 0, left: 0, transform: [{ scaleY: -1 }] },
});
