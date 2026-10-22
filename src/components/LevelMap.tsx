/*
 * The level map (owner's idea, not in the mockup): tapping the header's level
 * pill opens the level path full screen. The player scrolls it freely, from
 * level 1 at the bottom up to the highest level they have reached, with their
 * character standing on the stop they're on. Past that it's fog (LevelPath),
 * so they never see how many levels there are. A card at the bottom says how
 * many words are left to the next level.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Character } from '../characters/rig';
import { LevelProgress, wordsToNextLevel } from '../game/levels';
import { t } from '../i18n';
import { colors, fonts, levelColor } from '../theme';
import { Avatar } from './GameHeader';
import { closeXml, Icon, starXml } from './icons';
import { EdgeFade, LevelStop, MARKER, MARKER_BOX, MARKER_LIFT, NODE, PathFog, pathLayout, PathRoad } from './LevelPath';
import { PaperBackground } from './PaperBackground';
import { Raised } from './Raised';

const SHOW_MS = 260;
const HIDE_MS = 200;
const BOB_MS = 900;
const MAX_PATH_W = 420;

interface Props {
  progress: LevelProgress;
  /** The highest level ever reached: every stop up to it is drawn, the rest is fog. */
  best: number;
  character: Character;
  /** After the sheet has slid away. The Play screen unmounts it here. */
  onClose: () => void;
}

/** The line under the level: words left to the next stop, to clear the fog, or the top reached. */
function nextLine(progress: LevelProgress, best: number) {
  const count = wordsToNextLevel(progress);
  if (count === null) return t('levelMap.top');
  const key = progress.level < best ? 'levelMap.toLevel' : 'levelMap.toFog';
  return t(count === 1 ? `${key}One` : key, { count, level: progress.level + 1 });
}

export function LevelMap({ progress, best, character, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathW = Math.min(width - 32, MAX_PATH_W);
  const level = progress.level;
  const [viewH, setViewH] = useState(0);
  // Either end of the path can sit in the middle of the window
  const layout = useMemo(() => (viewH ? pathLayout(pathW, viewH / 2, Math.max(best, level)) : null), [pathW, viewH, best, level]);
  const [fx] = useState(() => ({ show: new Animated.Value(0), bob: new Animated.Value(0) }));
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(fx.show, { toValue: 1, duration: SHOW_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const ease = { duration: BOB_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const bob = Animated.loop(Animated.sequence([Animated.timing(fx.bob, { toValue: 1, ...ease }), Animated.timing(fx.bob, { toValue: 0, ...ease })]));
    bob.start();
    return () => bob.stop();
  }, [fx]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(fx.show, { toValue: 0, duration: HIDE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onClose());
  }, [fx, onClose]);

  const onWindowLayout = useCallback((e: LayoutChangeEvent) => setViewH(Math.round(e.nativeEvent.layout.height)), []);

  const c = levelColor(level);
  const here = layout?.stops[level - 1];
  const toNext = wordsToNextLevel(progress);
  const total = toNext === null ? 0 : progress.wins + toNext;

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          opacity: fx.show,
          transform: [{ translateY: fx.show.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        },
      ]}
      accessibilityViewIsModal
    >
      <PaperBackground />
      <View style={{ height: insets.top }} />
      <View style={styles.head}>
        <View style={styles.headSide} />
        <Text style={styles.title} accessibilityRole="header">
          {t('levelMap.title')}
        </Text>
        <View style={styles.headSide}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('levelMap.close')} hitSlop={8}>
            {({ pressed }) => (
              <Raised depth={3} shadowColor={colors.shadow} radius={20} pressed={pressed} style={styles.close}>
                <Icon xml={closeXml(colors.ink)} size={18} />
              </Raised>
            )}
          </Pressable>
        </View>
      </View>

      <View
        style={styles.window}
        onLayout={onWindowLayout}
        accessible
        accessibilityLabel={t('levelMap.a11y.path', { level, best: Math.max(best, level) })}
      >
        {layout && here && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            // Open on the player's stop, the character in the middle of the window
            contentOffset={{ x: 0, y: Math.max(0, here.y - MARKER_LIFT / 2 - viewH / 2) }}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={{ width: pathW, height: layout.height }}>
              <PathRoad layout={layout} filled={level - 1} />
              {layout.stops.map((p, i) => (
                <View key={i} style={[styles.stop, { left: p.x - NODE / 2, top: p.y - NODE / 2 }]}>
                  <LevelStop level={i + 1} reached={i < level} />
                </View>
              ))}
              <PathFog id="levelMapFog" layout={layout} />
              <Animated.View
                style={[
                  styles.marker,
                  {
                    left: here.x - MARKER_BOX / 2,
                    top: here.y - MARKER_LIFT - MARKER_BOX / 2,
                    transform: [{ translateY: fx.bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
                  },
                ]}
              >
                <Avatar character={character} size={MARKER} />
              </Animated.View>
            </View>
          </ScrollView>
        )}
        <EdgeFade id="levelMapFadeTop" side="top" />
        <EdgeFade id="levelMapFadeBottom" side="bottom" />
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Raised depth={5} shadowColor={colors.shadow} radius={22} style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.level, { backgroundColor: c.light, borderColor: `${c.main}80` }]}>
              <Icon xml={starXml(c.main)} size={16} />
              <Text style={[styles.levelText, { color: c.dark }]}>{t('levelMap.here', { level })}</Text>
            </View>
            {toNext !== null && (
              <Text style={styles.count}>
                {progress.wins} / {total}
              </Text>
            )}
          </View>
          {toNext !== null && (
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${(progress.wins / total) * 100}%`, backgroundColor: c.main }]} />
            </View>
          )}
          <Text style={styles.next}>{nextLine(progress, best)}</Text>
        </Raised>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Over the level-change card (zIndex 10) and the result's stamp (zIndex 2), see play-screen.md
  sheet: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: colors.paper },
  head: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  headSide: { width: 44, alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontFamily: fonts.display700, fontSize: 25, color: colors.ink },
  close: { width: 40, height: 40, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  window: { flex: 1, minHeight: 0 },
  scrollContent: { alignItems: 'center' },
  stop: { position: 'absolute', width: NODE, height: NODE },
  marker: { position: 'absolute' },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
  card: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, padding: 14, gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  level: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 2, borderRadius: 14, paddingVertical: 5, paddingLeft: 8, paddingRight: 12 },
  levelText: { fontFamily: fonts.display600, fontSize: 17 },
  count: { fontFamily: fonts.display600, fontSize: 15, color: colors.muted },
  bar: { height: 12, borderRadius: 6, backgroundColor: colors.track, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  next: { fontFamily: fonts.body800, fontSize: 14, color: colors.muted, textAlign: 'center' },
});
