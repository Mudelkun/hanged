/*
 * The floating bottom tab bar from the mockup. At most 4 tabs, ever:
 * Play · Versus · Leaderboard · Characters (Profile opens from the avatar).
 * A tab without a route is drawn but can't be picked. The routes are the
 * (tabs) group's screens (src/app/(tabs)/_layout.tsx).
 *
 * The selected tab sits under a "lens", like the iOS 26 tab bar (owner's
 * request, 2026-10-24): a press lifts it into a bigger glass bubble that
 * follows the finger across the tabs, and letting go drops it on the nearest
 * one. The lens is a window onto a second, coloured copy of the tabs, so a
 * tab turns coloured exactly where the lens covers it. Each screen draws its
 * own bar, so every bar shares the lens's position: the next screen's bar
 * carries on the same slide.
 *
 * The drag and the lens run on the UI thread (gesture-handler + Reanimated):
 * the JS thread is busy redrawing the Play scene ~30 times a second, and a
 * JS-driven drag stuttered behind it on the phone.
 */
import { Href, router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  makeMutable,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { TranslationKey, useTranslation } from '../i18n';
import { colors, fonts } from '../theme';
import { Icon, tabIconXml } from './icons';
import { sound } from '../audio';

type TabId = keyof typeof tabIconXml;

const TABS: { id: TabId; label: TranslationKey; href?: Href }[] = [
  { id: 'play', label: 'tabs.play', href: '/' },
  { id: 'versus', label: 'tabs.versus', href: '/versus' },
  { id: 'leaderboard', label: 'tabs.leaderboard', href: '/leaderboard' },
  { id: 'characters', label: 'tabs.characters', href: '/characters' },
];
const OPEN = TABS.map((tab) => !!tab.href); // read on the UI thread
const LAST = TABS.length - 1;
const INSET = 4; // gap between the resting lens and the bar's edge
const LIFT_SCALE = 1.16;
const DRAG_SLOP = 6;

// Shared by every screen's bar (see above). `pos` is a tab index, fractional
// mid-drag; `at` is where it's heading; `target` (JS only) is the tab shown.
const pos = makeMutable(0);
const at = makeMutable(0);
const lift = makeMutable(0);
const stretch = makeMutable(1);
const dragging = makeMutable(false); // the pan activated: it picks on release, not the tap
let target = 0;

// Reanimated 4 springs default to a mass of 4: always set it, or they overshoot by a whole tab.
const GLIDE = { mass: 1, stiffness: 260, damping: 26 };
const FOLLOW = { mass: 1, stiffness: 900, damping: 60 };
const LIFT = { mass: 1, stiffness: 420, damping: 24 };
const DROP = { mass: 1, stiffness: 300, damping: 26 };

/** Glide the lens to tab `i`, stretching it a little on the way, like a drop of liquid. */
function slideTo(i: number) {
  'worklet';
  const far = Math.min(Math.abs(i - at.value), 2);
  at.value = i;
  pos.value = withSpring(i, GLIDE);
  stretch.value = withSequence(withTiming(1 + 0.1 * far, { duration: 110 }), withSpring(1, GLIDE));
}

const unlockSound = () => sound.unlock();

/** Open tab `i` from the bar showing tab `from` (the lens is already on its way). */
function open(i: number, from: number) {
  const { href } = TABS[i];
  if (i === from || !href) return;
  target = i;
  sound.play('tab');
  router.navigate(href);
}

export function TabBar({ active, compact }: { active: TabId; compact: boolean }) {
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const slot = size.w / TABS.length;
  const index = TABS.findIndex((tab) => tab.id === active);

  // However the player got here (a tab, a button, a link), the lens follows.
  useEffect(() => {
    if (focused && target !== index) {
      target = index;
      slideTo(index);
    }
  }, [focused, index]);

  // A press lifts the lens onto the pressed tab. Then either the finger moves
  // and the pan carries the lens under it, picking the nearest tab on release,
  // or it lifts in place and the tap picks the pressed tab. They compete: a
  // pan never activates on a tap (it fails, which reads as cancelled), so it
  // can't tell a tap from a cancel by itself.
  /** The tab index under `x` on the row, fractional between two tabs. */
  const under = (x: number) => {
    'worklet';
    return Math.min(Math.max(x / slot - 0.5, 0), LAST);
  };
  const pick = (i: number) => {
    'worklet';
    const tab = OPEN[i] ? i : index;
    slideTo(tab);
    scheduleOnRN(open, tab, index);
  };
  const pan = usePanGesture({
    minDistance: DRAG_SLOP,
    enabled: slot > 0,
    onBegin: (e) => {
      'worklet';
      scheduleOnRN(unlockSound);
      lift.value = withSpring(1, LIFT);
      slideTo(Math.round(under(e.x)));
    },
    onActivate: () => {
      'worklet';
      dragging.value = true;
    },
    onUpdate: (e) => {
      'worklet';
      at.value = under(e.x);
      pos.value = withSpring(at.value, FOLLOW);
      stretch.value = withSpring(1 + Math.min(Math.abs(e.velocityX) / 12000, 0.18), FOLLOW);
    },
    onFinalize: (e) => {
      'worklet';
      lift.value = withDelay(80, withSpring(0, DROP));
      if (!dragging.value) return; // a tap: the tap gesture picks
      dragging.value = false;
      pick(e.canceled ? index : Math.round(at.value));
    },
  });
  const tap = useTapGesture({
    enabled: slot > 0,
    maxDuration: 60_000, // a long, still press still picks the tab, as on iOS
    maxDistance: DRAG_SLOP * 4,
    onActivate: (e) => {
      'worklet';
      pick(Math.round(under(e.x)));
    },
    onFinalize: (e) => {
      'worklet';
      // Neither a tap nor a drag (the touch was cancelled): back to this tab.
      if (e.canceled && !dragging.value) slideTo(index);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w !== size.w || h !== size.h) setSize({ w, h });
  };

  const lensStyle = useAnimatedStyle(() => {
    const scale = interpolate(lift.value, [0, 1], [1, LIFT_SCALE]);
    return {
      transform: [{ translateX: pos.value * slot }, { scaleX: scale * stretch.value }, { scaleY: scale }],
    };
  });
  const mirrorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.value * slot }] }));
  const glassStyle = useAnimatedStyle(() => ({ opacity: lift.value }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: interpolate(lift.value, [0, 1], [1, 0.35]) }));
  const radius = (size.h - 2 * INSET) / 2;

  const row = (on: boolean) =>
    TABS.map((tab, i) => (
      <View
        key={tab.id}
        style={styles.tab}
        {...(!on && {
          accessible: true,
          accessibilityRole: 'tab' as const,
          accessibilityLabel: tab.href ? t(tab.label) : `${t(tab.label)}, ${t('tabs.comingSoon')}`,
          accessibilityState: { selected: i === index, disabled: !tab.href },
          accessibilityActions: [{ name: 'activate' as const }],
          onAccessibilityAction: () => {
            if (!tab.href) return;
            slideTo(i);
            open(i, index);
          },
        })}
      >
        <Icon xml={tabIconXml[tab.id](on ? colors.coral : colors.tabIdle)} size={28} height={24} />
        <Text style={[styles.label, on && { color: colors.coralD }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t(tab.label)}</Text>
      </View>
    ));

  return (
    <View style={[styles.bar, { height: compact ? 60 : 68, marginBottom: Math.max(insets.bottom - 8, 10) }]}>
      <GestureDetector gesture={gesture}>
        <View style={styles.row} onLayout={onLayout}>
          {row(false)}
          {size.w > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.lens, { width: slot - 2 * INSET, height: size.h - 2 * INSET }, lensStyle]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, styles.glass, { borderRadius: radius }, glassStyle]} />
              <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.coralL }, tintStyle]} />
                <Animated.View style={[styles.mirror, { width: size.w, height: size.h }, mirrorStyle]}>
                  {row(true)}
                </Animated.View>
              </View>
            </Animated.View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginTop: 6,
    marginHorizontal: 12,
    borderRadius: 26,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 6,
    shadowColor: 'rgb(150,95,50)',
    shadowOpacity: 0.3,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 10 },
  },
  row: { flex: 1, flexDirection: 'row' },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 3 },
  label: { fontFamily: fonts.display600, fontSize: 12, color: colors.tabLabel },
  lens: { position: 'absolute', left: INSET, top: INSET },
  glass: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: 'rgb(150,95,50)',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  mirror: { position: 'absolute', left: -INSET, top: -INSET, flexDirection: 'row' },
});
