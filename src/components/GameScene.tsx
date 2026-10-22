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

import { BalloonAnim, Character, Frame, HangedRig, structureKey } from '../characters/rig';
import { useSoundScope } from '../audio/AudioProvider';
import { balloonSounds } from '../audio/scenes';
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

function AnimatedCharacter({ character, stage, gone, mode, entering }: { character: Character; stage: number; gone: number; mode: SceneMode; entering?: boolean }) {
  const audio = useSoundScope();
  const step = useRef<Step>({ from: stage, to: stage, goneFrom: gone, goneTo: gone, start: 0 });
  const [view, setView] = useState(() => restFrame(character, mode, stage, gone));
  const focused = useIsFocused();
  const [arrival] = useState(() => new Animated.Value(entering ? -100 : 0));
  useEffect(() => {
    if (!entering) return;
    const animation = Animated.spring(arrival, { toValue: 0, friction: 8, tension: 48, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [arrival, entering]);
  // A character picked on the Characters tab shows at once, at rest, until the loop draws its next frame.
  const drawn = view.character === character ? view : restFrame(character, mode, stage, gone);

  useEffect(() => {
    const s = step.current;
    if (stage !== s.to || gone !== s.goneTo) {
      audio.cancel();
      if (gone > s.goneTo) audio.sequence(balloonSounds(stage === 10, BalloonAnim.STAGES[stage].dur ?? BalloonAnim.DURATION, character.id, gone % 3 === 0));
      step.current = { from: s.to, to: stage, goneFrom: s.goneTo, goneTo: gone, start: performance.now() };
    }
  }, [stage, gone, character.id, audio]);

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
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: arrival }] }]} onLayout={onLayout}>
      <SvgXml key={drawn.key} xml={drawn.xml} width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio={`xMidYMax ${fit}`} />
    </Animated.View>
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
  entering?: boolean;
  character: Character;
  stage: number;
  /** Balloons gone out of 10 (balloonsGone): one pops per miss. */
  gone: number;
  mode: SceneMode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function GameScene({ character, stage, gone, mode, style, accessibilityLabel, entering }: Props) {
  return (
    <Raised shadowColor={colors.shadow} radius={28} outerStyle={style} style={styles.scene}>
      <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <Sky sad={mode === 'lost'} />
        <AnimatedCharacter character={character} stage={stage} gone={gone} mode={mode} entering={entering} />
      </View>
    </Raised>
  );
}

// ---- the rubber stamp ("DROPPED !!" / "HANGING !!") ----

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

// The text is sized to fit, not squeezed: react-native-svg on iOS ignores textLength, so a long
// stamp used to run past the frame. Advance widths (em) of Fredoka Bold, read from the .ttf.
const FREDOKA_BOLD_EM: Record<string, number> = {
  A: 0.711, B: 0.609, C: 0.631, D: 0.655, E: 0.603, F: 0.613, G: 0.719, H: 0.65, I: 0.239, J: 0.531,
  K: 0.597, L: 0.569, M: 0.809, N: 0.67, O: 0.721, P: 0.595, Q: 0.782, R: 0.604, S: 0.542, T: 0.64,
  U: 0.675, V: 0.728, W: 0.947, X: 0.689, Y: 0.638, Z: 0.598, ' ': 0.235, '!': 0.248, '?': 0.476, '.': 0.22,
};
const WIDEST_EM = 0.75; // unknown characters (e.g. accented letters later) count as wide, so they still fit
const emWidth = (s: string) => [...s].reduce((w, c) => w + (FREDOKA_BOLD_EM[c.toUpperCase()] ?? WIDEST_EM), 0);

// Text box inside the inner frame (viewBox units). Fredoka caps are 0.7em tall.
const STAMP_TEXT_W = 296;
const STAMP_MID_Y = 78;
const STAMP_FONT_MAX = [74, 50]; // one line, two lines (two lines of 50 fill the inner frame's height)
const STAMP_ONE_LINE_MIN = 50; // below this a single line reads too small: break it in two instead

/** Lines and font size so the text fits the frame. Long text breaks at the space nearest its middle. */
function stampLayout(text: string): { lines: string[]; fontSize: number } {
  const fit = (lines: string[]) =>
    Math.min(STAMP_FONT_MAX[lines.length - 1], ...lines.map((l) => STAMP_TEXT_W / emWidth(l)));
  const one = fit([text]);
  let cut = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (cut < 0 || Math.abs(i - text.length / 2) < Math.abs(cut - text.length / 2))) cut = i;
  }
  if (one >= STAMP_ONE_LINE_MIN || cut < 0) return { lines: [text], fontSize: one };
  const two = [text.slice(0, cut), text.slice(cut + 1)];
  return { lines: two, fontSize: fit(two) };
}

function StampArt({ text, color, width, height }: { text: string; color: string; width: number; height: number }) {
  const { lines, fontSize } = stampLayout(text);
  const cap = fontSize * 0.7;
  const gap = fontSize * 0.24;
  const firstBaseline = STAMP_MID_Y - (lines.length * cap + (lines.length - 1) * gap) / 2 + cap;
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
        {lines.map((line, i) => (
          <SvgText
            key={i}
            x="186"
            y={firstBaseline + i * (cap + gap)}
            textAnchor="middle"
            fontFamily="Fredoka_700Bold"
            fontWeight="700"
            fontSize={fontSize}
            fill={color}
          >
            {line}
          </SvgText>
        ))}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, borderWidth: 3, borderColor: '#fff', borderRadius: 28 },
  sunWrap: { position: 'absolute', right: 34 - 21, top: 22 - 21 },
  stamp: { position: 'absolute', left: '50%', top: '50%', zIndex: 2 },
});
