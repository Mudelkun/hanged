/*
 * The loading screen: plays once per cold start, over the app (design/branding.html,
 * Context/branding.md). Its first frame IS the native splash (app.json: the blank wordmark
 * centred on SPLASH.bg), so the native splash is hidden only once that frame is on screen.
 * Then the word solves itself, the buddy floats up, and everything lifts off while the
 * screen fades into the app. The frames come from design/brand/brand.js.
 *
 * A tap skips to the lift-off. With Reduce Motion, the word shows at once and the screen
 * just fades. The game never waits on it: the app is mounted underneath and ready.
 */
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { sound } from '../audio';
import { BRAND_FONTS, HangedBrand, SPLASH } from '../brand/brand';
import { characterById, structureKey } from '../characters/rig';
import { feedback } from '../feedback';
import { useTranslation } from '../i18n';

const FRAME_MS = 33; // ~30 frames a second, like the Play scene
const STILL_HOLD_MS = 700;
const STILL_FADE_MS = 400;
// A cue whose moment was jumped over (a tap skipped past it) stays quiet
const LATE = 0.25;

const seg = (t: number, [a, b]: [number, number]) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** What plays when: a soft tick as each letter turns, a tap when the word is solved, a rise on lift-off. */
function cues(letters: number) {
  return [
    ...Array.from({ length: letters }, (_, i) => ({ at: SPLASH.letterAt(i) + SPLASH.flip * 0.3, run: () => sound.play('tile', 0.8) })),
    { at: SPLASH.letterAt(letters - 1) + SPLASH.flip, run: () => feedback.launch() },
    { at: SPLASH.exit, run: () => sound.play('level-rise', 0.6) },
  ];
}

export function LaunchScreen({ characterId, onDone }: { characterId: string | null; onDone: () => void }) {
  const t = useTranslation();
  const { width: w, height: h } = useWindowDimensions();
  const word = t('brand.word');
  const [time, setTime] = useState(0);
  // null until known: frame 0 shows meanwhile, which is the native splash anyway
  const [still, setStill] = useState<boolean | null>(null);
  const [fade] = useState(() => new Animated.Value(1));
  const skip = useRef(0);
  const elapsed = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(r => live && setStill(r), () => live && setStill(false));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (still !== false) return;
    const schedule = cues([...word].length);
    const began = performance.now();
    let frame = 0, last = -Infinity, next = 0;
    // The frame callback's own timestamp isn't on performance.now()'s clock everywhere: read it here
    const tick = () => {
      const now = performance.now(), el = (now - began) / 1000 + skip.current;
      elapsed.current = el;
      for (; next < schedule.length && el >= schedule[next].at; next++) if (el - schedule[next].at < LATE) schedule[next].run();
      if (el >= SPLASH.end) return done.current();
      if (now - last >= FRAME_MS) { last = now; setTime(el); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still, word]);

  useEffect(() => {
    if (!still) return;
    const out = Animated.sequence([Animated.delay(STILL_HOLD_MS), Animated.timing(fade, { toValue: 0, duration: STILL_FADE_MS, useNativeDriver: true })]);
    out.start(({ finished }) => finished && done.current());
    return () => out.stop();
  }, [still, fade]);

  const skipToExit = () => { if (elapsed.current < SPLASH.exit) skip.current += SPLASH.exit - elapsed.current; };
  const xml = HangedBrand.splash(time, {
    w, h, character: characterId ? characterById(characterId) : null,
    word, tagline: t('brand.tagline'), fonts: BRAND_FONTS, still: !!still,
  });
  return <Animated.View style={[styles.screen, { opacity: still ? fade : 1 - seg(time, SPLASH.fade) }]}
    onLayout={() => { SplashScreen.hideAsync().catch(() => {}); }}>
    <Pressable style={StyleSheet.absoluteFill} onPress={skipToExit}
      accessibilityRole="button" accessibilityLabel={t('app.name')} accessibilityHint={t('launch.skipHint')}>
      <SvgXml key={structureKey(xml)} xml={xml} width={w} height={h} />
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100, backgroundColor: SPLASH.bg },
});
