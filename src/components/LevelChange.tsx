/*
 * Level up / level down (owner's idea, not in the mockup): a card over the
 * round result showing the level path, a winding road of numbered stops with
 * one colour per level (theme.levelColors). The player's character hops up to
 * the next stop or slides back down to the one before, the camera following
 * it, while a trail in the level's colour fills or empties along the road. The
 * path (LevelPath) stops at the highest level reached; past it is fog. When it
 * lands, the stop pops (with sparkles going up) and `onLanded` lets the header
 * show the new level. Reaching the top level is bigger: its own title, the
 * camera pans up to the castle, the fog lifts off it, confetti, and a crown
 * lands on the character. The card has no button: it lingers a moment, then
 * fades out by itself.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Character } from '../characters/rig';
import { feedback } from '../feedback';
import { useSoundScope } from '../audio/AudioProvider';
import { worldBands } from '../world/world';
import { useTranslation } from '../i18n';
import { LEVELS } from '../game/levels';
import { colors, confettiColors, fonts, levelColor, worldColors } from '../theme';
import { Confetti } from './Confetti';
import { Avatar } from './GameHeader';
import { crownXml, Icon } from './icons';
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
/** After the result's stamp has popped, before the card shows. */
const WARM_MS = 500;
const WORLD_ID = 'levelChangeWorld';
const SHOW_MS = 280;
/** Card shown → the character sets off. */
const START_MS = 450;
const TRAVEL_MS = { up: 950, down: 1150 };
/** Landed → the card fades out by itself, so the stop's pop and sparkles play out first. */
const HOLD_MS = 1300;
/** On the top level, longer: the fog lifts and the confetti falls. */
const HOLD_TOP_MS = 2600;
const FOG_LIFT_MS = 700;
const CONFETTI_MS = 2100;
/** Reaching the top, the camera ends with the stop this share of the window below the middle, to show the castle. */
const TOP_LIFT = 0.24;
const HIDE_MS = 220;
const SAMPLES = 8;
const CROWN = crownXml();

/**
 * The path up to the `best` level reached, and the character's trip on it,
 * for a card `width` wide and `viewH` tall. Climbing onto the top level, the
 * camera drifts up as the character climbs (`lift`), so it ends on the castle.
 */
function geometry(width: number, viewH: number, from: number, to: number, best: number) {
  const edge = viewH / 2;
  const top = to > from && to >= LEVELS.length;
  const lift = top ? Math.round(viewH * TOP_LIFT) : 0;
  // Room over the last stop: exactly what the window shows when the camera stops there
  const layout = pathLayout(width, edge, edge + lift + MARKER_LIFT / 2, Math.max(best, from, to));
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
    top,
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
    // Keep the character (and the stop under it) in the middle of the window, lower on the way to the top
    camera: pts.map((p, k) => edge - (p.y - MARKER_LIFT / 2) + lift * inputRange[k]),
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
  const t = useTranslation();
  const audio = useSoundScope();
  const up = to > from;
  const cardW = Math.min(width, 360);
  const pathW = cardW - 32;
  const viewH = compact ? 220 : 280;
  const geo = useMemo(() => geometry(pathW, viewH, from, to, best), [pathW, viewH, from, to, best]);
  const top = geo.top;
  const [fx] = useState(() => ({
    show: new Animated.Value(0),
    travel: new Animated.Value(0),
    // SVG props can't use the native driver, so the road has its own value
    fill: new Animated.Value(up ? 0 : 1),
    land: new Animated.Value(1),
    burst: new Animated.Value(1),
    // Reaching the top: the fog lifts, confetti, the crown
    fog: new Animated.Value(1),
    confetti: new Animated.Value(0),
    crown: new Animated.Value(0),
  }));
  // Two party poppers from the window's bottom corners, toward the castle
  const poppers = useMemo(
    () => [
      { seed: 11, width: pathW, height: viewH, origin: { x: 0, y: viewH * 0.9 }, aim: -Math.PI / 2 + 0.5 },
      { seed: 29, width: pathW, height: viewH, origin: { x: pathW, y: viewH * 0.9 }, aim: -Math.PI / 2 - 0.5 },
    ],
    [pathW, viewH],
  );
  const [open, setOpen] = useState(false);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setOpen(true), APPEAR_MS);
    // Draw the world while the card waits, so it opens without a stutter (it's kept: see worldBands)
    const warm = setTimeout(() => worldBands(geo.layout, WORLD_ID), WARM_MS);
    return () => {
      clearTimeout(id);
      clearTimeout(warm);
    };
  }, [geo.layout]);

  useEffect(() => {
    if (!open) return;
    const stillCurrent = audio.continuation();
    const cancelAudio = audio.sequence([{ cue: 'panel-open' }, { cue: up ? 'level-rise' : 'level-slide', at: SHOW_MS + START_MS }]);
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
      if (stillCurrent()) {
        audio.play(top ? 'summit' : up ? 'level-up' : 'level-down');
        audio.sequence([{ voice: up ? 'joy' : 'recover', character: character.id, at: 220, gain: .8 }]);
      }
      popFrom(fx.land, up ? 0.5 : 0.8);
      if (up) {
        fx.burst.setValue(0);
        Animated.timing(fx.burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        feedback.levelUp();
      } else feedback.levelDown();
      if (top) {
        if (stillCurrent()) {
          audio.play('fog');
          audio.play('confetti', .8);
          audio.sequence([{ cue: 'crown', at: 180, gain: .75 }]);
        }
        Animated.timing(fx.fog, { toValue: 0, duration: FOG_LIFT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        Animated.timing(fx.confetti, { toValue: 1, duration: CONFETTI_MS, easing: Easing.linear, useNativeDriver: true }).start();
        popFrom(fx.crown, 0);
      }
    });
    road.start();
    return () => {
      run.stop();
      road.stop();
      cancelAudio();
    };
  }, [open, up, top, fx, audio, character.id]);

  useEffect(() => {
    if (!landed) return;
    onLanded();
    const hide = Animated.timing(fx.show, { toValue: 0, duration: HIDE_MS, delay: top ? HOLD_TOP_MS : HOLD_MS, useNativeDriver: true });
    hide.start(({ finished }) => finished && onClose());
    return () => hide.stop();
  }, [landed, top, onLanded, onClose, fx]);

  if (!open) return null;
  const at = (input: number[]) => fx.travel.interpolate({ inputRange: geo.inputRange, outputRange: input });
  const hop = fx.travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, up ? -26 : -10, 0] });
  const tilt = fx.travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', up ? '8deg' : '-12deg', '0deg'] });
  const current = landed ? to : from;
  const c = levelColor(to);
  const word = top ? 'top' : up ? 'up' : 'down';

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
              <PathWorld id={WORLD_ID} layout={geo.layout} />
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
              {/* Climbing onto the top, the fog still hides the castle until the character lands */}
              {(geo.layout.more || top) && (
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: fx.fog }]} pointerEvents="none">
                  <PathFog id="levelChangeFog" layout={geo.layout} />
                </Animated.View>
              )}
              <Animated.View
                style={[
                  styles.marker,
                  { transform: [{ translateX: at(geo.markerX) }, { translateY: Animated.add(at(geo.markerY), hop) }, { rotate: tilt }] },
                ]}
              >
                <Avatar character={character} size={MARKER} />
                {top && (
                  <Animated.View style={[styles.crown, { opacity: fx.crown, transform: [{ rotate: '-12deg' }, { scale: fx.crown }] }]} pointerEvents="none">
                    <Icon xml={CROWN} size={26} height={20} />
                  </Animated.View>
                )}
              </Animated.View>
            </Animated.View>
            {top && poppers.map((p) => <Confetti key={p.seed} fire={fx.confetti} colors={confettiColors} {...p} />)}
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
  // On the character's head, tilted like a hat worn at an angle (a flat 2D rotate)
  crown: { position: 'absolute', top: -15, left: MARKER_BOX / 2 - 13 },
});
