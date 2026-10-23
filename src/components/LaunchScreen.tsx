/*
 * The loading screen: plays once per cold start, over the app (design/branding.html,
 * Context/branding.md). Its first frame IS the native splash (app.json: the blank wordmark
 * centred on SPLASH.bg), so the native splash is hidden only once that frame is on screen.
 * Then the word solves itself, the buddy floats up, and everything lifts off while the
 * screen fades into the app.
 *
 * It plays while the app mounts underneath, when the JS thread is at its busiest, so nothing
 * here is drawn per frame: each layer of design/brand/brand.js (a tile, a balloon, the buddy...)
 * is drawn once, and its motion, sampled from brand.js, runs on the native driver's clock.
 *
 * A tap skips to the lift-off. With Reduce Motion, the word shows at once and the screen
 * just fades. The game never waits on it: the app is mounted underneath and ready.
 */
import * as SplashScreen from 'expo-splash-screen';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { sound } from '../audio';
import { BRAND_FONTS, HangedBrand, LayerPos, SPLASH, SplashLayer } from '../brand/brand';
import { characterById } from '../characters/rig';
import { feedback } from '../feedback';
import { useTranslation } from '../i18n';

const SAMPLES_PER_S = 60; // brand.js is read this often; the native driver draws straight lines in between
// How far those straight lines may stray from brand.js before they need another point
const EPS: LayerPos = { x: 0.15, y: 0.15, r: 0.1, s: 0.002, o: 0.01 };
const STILL_HOLD_MS = 700;
const STILL_FADE_MS = 400;
// A cue whose moment was jumped over (a tap skipped past it) stays quiet
const LATE = 0.25;

/** What plays when: a soft tick as each letter turns, a tap when the word is solved, a rise on lift-off. */
function cues(letters: number) {
  return [
    ...Array.from({ length: letters }, (_, i) => ({ at: SPLASH.letterAt(i) + SPLASH.flip * 0.3, run: () => sound.play('tile', 0.8) })),
    { at: SPLASH.letterAt(letters - 1) + SPLASH.flip, run: () => feedback.launch() },
    { at: SPLASH.exit, run: () => sound.play('level-rise', 0.6) },
  ];
}

type Value = number | string | Animated.AnimatedInterpolation<number | string>;

const N = Math.round(SPLASH.end * SAMPLES_PER_S);
const TIMES = Array.from({ length: N + 1 }, (_, i) => (i * SPLASH.end) / N);

/** One property as a curve of the clock: only the samples a straight line can't stand in for. */
function curve(clock: Animated.Value, vs: number[], eps: number, unit = ''): Value {
  const out = (v: number) => (unit ? `${+v.toFixed(3)}${unit}` : +v.toFixed(4));
  if (vs.every(v => Math.abs(v - vs[0]) <= eps)) return out(vs[0]);
  const keep = [0];
  for (let b = 2; b < vs.length; b++) {
    const a = keep[keep.length - 1];
    for (let i = a + 1; i < b; i++) {
      if (Math.abs(vs[a] + ((vs[b] - vs[a]) * (i - a)) / (b - a) - vs[i]) > eps) { keep.push(b - 1); break; }
    }
  }
  keep.push(vs.length - 1);
  return clock.interpolate({ inputRange: keep.map(i => TIMES[i]), outputRange: keep.map(i => out(vs[i])) as number[], extrapolate: 'clamp' });
}

/** A layer's place: still at t = 0 (or Reduce Motion's frame) without a clock, else following it. */
function motion(layer: SplashLayer, clock: Animated.Value | null) {
  const pos = (m: LayerPos) => ({ ...m, s: m.s / layer.zoom }); // drawn zoom times bigger, so it stays sharp
  if (!clock) {
    const m = pos(layer.at(0));
    return { x: m.x, y: m.y, r: `${m.r}deg`, s: m.s, o: m.o };
  }
  const samples = TIMES.map(t => pos(layer.at(t)));
  const track = (k: keyof LayerPos, unit?: string) => curve(clock, samples.map(m => m[k]), EPS[k], unit);
  return { x: track('x'), y: track('y'), r: track('r', 'deg'), s: track('s'), o: track('o') };
}

/** One layer of brand.js: parsed once, moved by the native driver. */
const Layer = memo(function Layer({ layer, clock }: { layer: SplashLayer; clock: Animated.Value | null }) {
  const [bx, by, bw, bh] = layer.box, px = layer.unit * layer.zoom;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layer.box.join(' ')}">${layer.svg}</svg>`;
  const style = useMemo(() => {
    const m = motion(layer, clock);
    return {
      left: bx * px, top: by * px, width: bw * px, height: bh * px,
      // The layer's 0, 0 sits at the screen's 0, 0 until moved, and turns and scales around it
      transformOrigin: `${-bx * px}px ${-by * px}px`,
      opacity: m.o,
      transform: [{ translateX: m.x }, { translateY: m.y }, { rotate: m.r }, { scale: m.s }],
    } as Animated.WithAnimatedValue<object>;
  }, [layer, clock, bx, by, bw, bh, px]);
  return <Animated.View pointerEvents="none" style={[styles.layer, style]}>
    <SvgXml xml={xml} width={bw * px} height={bh * px} />
  </Animated.View>;
});

export function LaunchScreen({ characterId, onDone }: { characterId: string | null; onDone: () => void }) {
  const t = useTranslation();
  const { width: w, height: h } = useWindowDimensions();
  const word = t('brand.word'), tagline = t('brand.tagline');
  // null until known: frame 0 shows meanwhile, which is the native splash anyway
  const [still, setStill] = useState<boolean | null>(null);
  const [clock] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const skip = useRef<(() => void) | null>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(r => live && setStill(r), () => live && setStill(false));
    return () => { live = false; };
  }, []);

  const layers = useMemo(() => HangedBrand.splashLayers({
    w, h, character: characterId ? characterById(characterId) : null, word, tagline, fonts: BRAND_FONTS, still: !!still,
  }), [w, h, characterId, word, tagline, still]);

  useEffect(() => {
    if (still !== false) return;
    // The hand-over is the last cue: on a timer, like the others, so a skip moves it too
    const pending = [...cues([...word].length), { at: SPLASH.end, run: () => done.current() }];
    let anim: Animated.CompositeAnimation, timers: ReturnType<typeof setTimeout>[] = [], from = 0, began = 0;
    const stop = () => { anim.stop(); timers.forEach(clearTimeout); };
    // Plays from second `at`: the motion on the native clock, the cues on timers
    const play = (at: number) => {
      from = at;
      began = performance.now();
      clock.setValue(at);
      timers = pending.filter(c => c.at > at - LATE).map(c => setTimeout(() => {
        pending.splice(pending.indexOf(c), 1);
        c.run();
      }, Math.max(0, c.at - at) * 1000));
      anim = Animated.timing(clock, { toValue: SPLASH.end, duration: (SPLASH.end - at) * 1000, easing: Easing.linear, useNativeDriver: true });
      anim.start();
    };
    skip.current = () => {
      if (from + (performance.now() - began) / 1000 >= SPLASH.exit) return;
      stop();
      play(SPLASH.exit);
    };
    play(0);
    return () => { skip.current = null; stop(); };
  }, [still, word, clock]);

  useEffect(() => {
    if (!still) return;
    const out = Animated.sequence([Animated.delay(STILL_HOLD_MS), Animated.timing(fade, { toValue: 0, duration: STILL_FADE_MS, useNativeDriver: true })]);
    out.start(({ finished }) => finished && done.current());
    return () => out.stop();
  }, [still, fade]);

  const moving = still === false ? clock : null;
  const fadeOut = useMemo(() => clock.interpolate({ inputRange: SPLASH.fade, outputRange: [1, 0], extrapolate: 'clamp' }), [clock]);
  const opacity = still ? fade : moving ? fadeOut : 1;
  return <Animated.View style={[styles.screen, { opacity }]} onLayout={() => { SplashScreen.hideAsync().catch(() => {}); }}>
    <Pressable style={StyleSheet.absoluteFill} onPress={() => skip.current?.()}
      accessibilityRole="button" accessibilityLabel={t('app.name')} accessibilityHint={t('launch.skipHint')}>
      {layers.map((layer, i) => <Layer key={i} layer={layer} clock={moving} />)}
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100, backgroundColor: SPLASH.bg, overflow: 'hidden' },
  layer: { position: 'absolute' },
});
