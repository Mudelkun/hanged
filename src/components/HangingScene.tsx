/*
 * The scene card: sky (CSS in the mockup, an SVG gradient here), drifting
 * clouds, and the hanging scene from design/characters/hanging.js.
 *
 * The hanging scene is re-rendered from HangedAnim.frame() about 30 times a
 * second: when the stage changes it tweens between the two keyframes, and
 * every stage has its own looping motion (wave, shiver, wobble, sway...).
 * Each frame is an SVG string drawn by <SvgXml>; a frame is ~7 KB and
 * cheap to build and parse.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Rect, Stop, SvgXml, Text as SvgText } from 'react-native-svg';

import { Character, Frame, HangedAnim, HangedRig } from '../characters/rig';
import { colors } from '../theme';
import { cloudXml, Icon } from './icons';
import { Raised } from './Raised';

export type SceneMode = 'play' | 'won' | 'lost';

/** Crops of the 480×470 scene, from the mockup (PLAY_VB and the Round lost crop). */
export const PLAY_VIEWBOX = '-150 18 780 432';
export const RESULT_VIEWBOX = '-60 18 600 432';

const FRAME_MS = 33;

// The design scripts tag the root <svg> with a CSS class; React DOM rejects `class` on web.
const sceneXml = (c: Character, f: Frame) => HangedAnim.scene(c, f).replace(' class="hanged-scene"', '');

// The winning pose: back on the grass at the stage-0 spot, cheering and hopping.
function wonFrame(t: number): Frame {
  const f = HangedAnim.frame(0, 0, 1, t, false);
  const cheer = HangedRig.POSES.cheer;
  return {
    ...f,
    expr: 'joy',
    coil: 'none',
    ty: f.ty - Math.abs(Math.sin(t * 4)) * 14,
    a: {
      ...f.a,
      ...cheer,
      armL: cheer.armL + Math.sin(t * 8) * 12,
      armR: cheer.armR - Math.sin(t * 8) * 12,
      tail: cheer.tail + Math.sin(t * 6) * 14,
    },
  };
}

// One frame of the scene: the tween from stage `from` to `to` at p (0..1), plus the loops at time t.
function frameXml(c: Character, mode: SceneMode, from: number, to: number, p: number, t: number) {
  return sceneXml(c, mode === 'won' ? wonFrame(t) : HangedAnim.frame(from, to, p, t));
}

function AnimatedCharacter({ character, stage, mode, viewBox }: { character: Character; stage: number; mode: SceneMode; viewBox: string }) {
  const tween = useRef({ from: stage, to: stage, start: 0 });
  const [xml, setXml] = useState(() => frameXml(character, mode, stage, stage, 1, 0));

  useEffect(() => {
    if (stage !== tween.current.to) tween.current = { from: tween.current.to, to: stage, start: performance.now() };
  }, [stage]);

  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= FRAME_MS) {
        last = now;
        const { from, to, start } = tween.current;
        const dur = HangedAnim.STAGES[to].dur ?? HangedAnim.DURATION;
        const p = Math.min(1, Math.max(0, (now - start) / dur));
        setXml(frameXml(character, mode, from, to, p, (now - t0) / 1000));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [character, mode]);

  // Fill the box (crop the sides) unless the box is wider than the crop:
  // then fit the height, so a short scene never cuts off the beam or a head.
  const [fit, setFit] = useState<'slice' | 'meet'>('slice');
  const [, , vbW, vbH] = viewBox.split(' ').map(Number);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFit(height > 0 && width / height > vbW / vbH ? 'meet' : 'slice');
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <SvgXml xml={xml} width="100%" height="100%" viewBox={viewBox} preserveAspectRatio={`xMidYMax ${fit}`} />
    </View>
  );
}

/** A cloud that drifts gently side to side. */
function Cloud({ left, right, top, width, fill = '#fff', opacity = 1, drift }: {
  left?: number; right?: number; top: number; width: number; fill?: string; opacity?: number; drift: number;
}) {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: drift, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: drift, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x, drift]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  return (
    <Animated.View style={{ position: 'absolute', left, right, top, opacity, transform: [{ translateX }] }}>
      <Icon xml={cloudXml(fill)} size={width} height={width / 2} />
    </Animated.View>
  );
}

function Sky({ sad }: { sad: boolean }) {
  const stops = sad ? ['#c3d1df', '#dfe7ef', '#f1f5f8'] : ['#a9dfff', '#d4efff', '#eef9ff'];
  return (
    <>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset={sad ? '0.6' : '0.55'} stopColor={stops[1]} />
            <Stop offset="1" stopColor={stops[2]} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sky)" />
      </Svg>
      {sad ? (
        <>
          <Cloud left={150} top={12} width={110} fill="#aebdcc" drift={7000} />
          <Cloud left={20} top={40} width={70} opacity={0.7} drift={9000} />
          <Cloud right={24} top={26} width={84} opacity={0.8} drift={8000} />
        </>
      ) : (
        <>
          <View style={styles.sunWrap} pointerEvents="none">
            <Svg width={88} height={88}>
              <Circle cx={44} cy={44} r={43} fill="rgba(255,226,122,0.16)" />
              <Circle cx={44} cy={44} r={32} fill="rgba(255,226,122,0.35)" />
              <Circle cx={44} cy={44} r={23} fill="#ffe27a" />
            </Svg>
          </View>
          <Cloud left={150} top={18} width={84} drift={8000} />
          <Cloud right={96} top={62} width={56} opacity={0.85} drift={6500} />
          <Cloud left={16} top={58} width={48} opacity={0.7} drift={9500} />
        </>
      )}
    </>
  );
}

interface Props {
  character: Character;
  stage: number;
  mode: SceneMode;
  viewBox: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function HangingScene({ character, stage, mode, viewBox, style, accessibilityLabel }: Props) {
  return (
    <Raised shadowColor={colors.shadow} radius={28} outerStyle={style} style={styles.scene}>
      <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <Sky sad={mode === 'lost'} />
        <AnimatedCharacter character={character} stage={stage} mode={mode} viewBox={viewBox} />
      </View>
    </Raised>
  );
}

// ---- the rubber stamp ("HANGED !!" / "SAVED !!") ----

// Deterministic specks knocked out of the ink, like a stamp pressed by hand
// (the mockup uses an feTurbulence filter, which react-native-svg cannot draw).
const SPECKS = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 90 }, () => ({ x: rnd() * 372, y: rnd() * 156, r: 0.6 + rnd() * 2.4 }));
})();

export function Stamp({ text, color, width, visible }: { text: string; color: string; width: number; visible: boolean }) {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [visible, pop]);
  if (!visible) return null;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1.9, 1] });
  const height = (width * 156) / 372;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.stamp,
        { width, height, marginLeft: -width / 2, marginTop: -height / 2, opacity: pop, transform: [{ rotate: '-11deg' }, { scale }] },
      ]}
    >
      <StampArt text={text} color={color} width={width} height={height} />
    </Animated.View>
  );
}

function StampArt({ text, color, width, height }: { text: string; color: string; width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 372 156">
      <Defs>
        <Mask id="stampInk" x="0" y="0" width="372" height="156" maskUnits="userSpaceOnUse">
          <Rect x="0" y="0" width="372" height="156" fill="#fff" />
          {SPECKS.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#000" />
          ))}
        </Mask>
      </Defs>
      <G mask="url(#stampInk)" opacity={0.96}>
        <Rect x="7" y="7" width="358" height="142" rx="20" fill="none" stroke={color} strokeWidth={8} />
        <Rect x="20" y="20" width="332" height="116" rx="12" fill="none" stroke={color} strokeWidth={3} />
        <SvgText
          x="186"
          y="104"
          textAnchor="middle"
          fontFamily="Fredoka_700Bold"
          fontWeight="700"
          fontSize={74}
          fill={color}
          textLength={296}
          lengthAdjust="spacingAndGlyphs"
        >
          {text}
        </SvgText>
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, borderWidth: 3, borderColor: '#fff', borderRadius: 28 },
  sunWrap: { position: 'absolute', right: 34 - 21, top: 22 - 21 },
  stamp: { position: 'absolute', left: '50%', top: '50%', zIndex: 2 },
});
