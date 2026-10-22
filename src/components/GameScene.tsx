/*
 * The scene card: sky (CSS in the mockup, an SVG gradient here), the sun,
 * and the balloon scene from design/characters/balloons.js (with its own
 * drifting clouds, hills and ground).
 *
 * The scene is re-rendered from BalloonAnim.frame() about 30 times a
 * second: when the stage changes it tweens between the two keyframes (the
 * pop, then the drop), and every stage has its own looping motion (bob,
 * kick, flap, panic...). Each frame is an SVG string drawn by <SvgXml>,
 * kept light (see balloons.js). The scene pans down with the character
 * inside the drawing; the viewBox itself never changes.
 *
 * The loop runs on a timer, not requestAnimationFrame: on React Native that
 * is a setTimeout(0), so a rAF loop would keep the JS thread busy non-stop.
 * It stops while another tab is in view (a frozen screen's timers still run).
 */
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Rect, Stop, SvgXml, Text as SvgText } from 'react-native-svg';

import { BalloonAnim, Character, Frame, HangedRig } from '../characters/rig';
import { colors } from '../theme';
import { cloudXml, Icon } from './icons';
import { Raised } from './Raised';

export type SceneMode = 'play' | 'won' | 'lost';

const FRAME_MS = 33;
const { CAMERA } = BalloonAnim;
const VIEWBOX = `${CAMERA.x} 0 ${CAMERA.w} ${CAMERA.h}`;

/** The step being animated: pose stages and balloons gone, before and after. */
interface Step {
  from: number;
  to: number;
  goneFrom: number;
  goneTo: number;
  start: number;
}

// The winning pose: still floating under the balloons that are left, cheering and bouncing.
function wonFrame(stage: number, gone: number, t: number): Frame {
  const f = BalloonAnim.frame(stage, stage, 1, t, false, [gone, gone]);
  const cheer = HangedRig.POSES.cheer;
  return {
    ...f,
    expr: 'joy',
    ty: f.ty - Math.abs(Math.sin(t * 4)) * 8,
    a: {
      ...f.a,
      armL: cheer.armL + Math.sin(t * 8) * 14,
      armR: f.a.armR - Math.sin(t * 8) * 6, // keeps holding the strings
      legL: cheer.legL + Math.sin(t * 8) * 8,
      legR: cheer.legR - Math.sin(t * 8) * 8,
      tail: cheer.tail + Math.sin(t * 6) * 14,
    },
  };
}

// react-native-svg on iOS keeps an attribute that a reused element no longer has: when a pop's
// burst star (a path with a transform) went away, the next balloon's body path took its place,
// kept its transform and was drawn far from the bunch (the browser was fine). So the drawing is
// remounted whenever its structure changes (tags and attribute names, values aside); otherwise
// React only updates values in place, which every platform gets right.
function structureKey(xml: string) {
  const shape = xml.replace(/="[^"]*"/g, '');
  let h = 5381;
  for (let i = 0; i < shape.length; i++) h = ((h << 5) + h + shape.charCodeAt(i)) | 0;
  return h;
}

// One frame of the scene: the step at p (0..1), plus the loops at time t.
function sceneFrame(c: Character, mode: SceneMode, s: Step, p: number, t: number) {
  const f = mode === 'won' ? wonFrame(s.to, s.goneTo, t) : BalloonAnim.frame(s.from, s.to, p, t, true, [s.goneFrom, s.goneTo]);
  // The design scripts tag the root <svg> with a CSS class; React DOM rejects `class` on web.
  // Lost keeps the grey native clouds of the sad sky instead of the scene's white ones.
  const xml = BalloonAnim.scene(c, f, { sky: false, clouds: mode !== 'lost', camera: true }).replace(' class="balloon-scene"', '');
  return { xml, key: structureKey(xml), character: c };
}

/** The scene at rest on a stage. */
const restFrame = (c: Character, mode: SceneMode, stage: number, gone: number) =>
  sceneFrame(c, mode, { from: stage, to: stage, goneFrom: gone, goneTo: gone, start: 0 }, 1, 0);

function AnimatedCharacter({ character, stage, gone, mode }: { character: Character; stage: number; gone: number; mode: SceneMode }) {
  const step = useRef<Step>({ from: stage, to: stage, goneFrom: gone, goneTo: gone, start: 0 });
  const [view, setView] = useState(() => restFrame(character, mode, stage, gone));
  const focused = useIsFocused();
  // A character picked on the Characters tab shows at once, at rest, until the loop draws its next frame.
  const drawn = view.character === character ? view : restFrame(character, mode, stage, gone);

  useEffect(() => {
    const s = step.current;
    if (stage !== s.to || gone !== s.goneTo)
      step.current = { from: s.to, to: stage, goneFrom: s.goneTo, goneTo: gone, start: performance.now() };
  }, [stage, gone]);

  // A new character keeps the step: it carries on from the same stage.
  useEffect(() => {
    if (!focused) return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const s = step.current;
      const dur = BalloonAnim.STAGES[s.to].dur ?? BalloonAnim.DURATION;
      const p = Math.min(1, Math.max(0, (now - s.start) / dur));
      setView(sceneFrame(character, mode, s, p, (now - t0) / 1000));
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [character, mode, focused]);

  // Fit the camera's height: crop the sides when the box is narrower than the window,
  // letterbox them (the grass runs on) when it is wider, so no balloon or head is ever cut.
  const [fit, setFit] = useState<'slice' | 'meet'>('slice');
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFit(height > 0 && width / height > CAMERA.w / CAMERA.h ? 'meet' : 'slice');
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <SvgXml key={drawn.key} xml={drawn.xml} width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio={`xMidYMax ${fit}`} />
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
        <View style={styles.sunWrap} pointerEvents="none">
          <Svg width={88} height={88}>
            <Circle cx={44} cy={44} r={43} fill="rgba(255,226,122,0.16)" />
            <Circle cx={44} cy={44} r={32} fill="rgba(255,226,122,0.35)" />
            <Circle cx={44} cy={44} r={23} fill="#ffe27a" />
          </Svg>
        </View>
      )}
    </>
  );
}

interface Props {
  character: Character;
  stage: number;
  /** Balloons gone out of 10 (balloonsGone): one pops per miss. */
  gone: number;
  mode: SceneMode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function GameScene({ character, stage, gone, mode, style, accessibilityLabel }: Props) {
  return (
    <Raised shadowColor={colors.shadow} radius={28} outerStyle={style} style={styles.scene}>
      <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <Sky sad={mode === 'lost'} />
        <AnimatedCharacter character={character} stage={stage} gone={gone} mode={mode} />
      </View>
    </Raised>
  );
}

// ---- the rubber stamp ("POPPED !!" / "SAVED !!") ----

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
