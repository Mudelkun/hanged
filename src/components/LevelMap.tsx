/*
 * The level map (owner's idea, not in the mockup): tapping the header's level
 * pill opens the level path full screen, as a world to climb (LevelPath):
 * terraces over a sea of clouds. The player scrolls it freely, from level 1 in
 * the meadow up to the highest level they have reached, with their character
 * standing on the stop they're on. Past that a plank bridge runs into fog, with
 * the castle far away, so they never see how many levels there are. On the top
 * level the fog is gone: the castle stands behind the last stop and the
 * character wears a crown. A wooden sign names it, and a card at the bottom says
 * how many words are left to the next level (or, at the top, how many were
 * guessed up there).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Character } from '../characters/rig';
import { LEVELS, levelByNumber, LevelProgress, wordsToNextLevel } from '../game/levels';
import { t } from '../i18n';
import { colors, fonts, levelColor, worldColors } from '../theme';
import { Avatar } from './GameHeader';
import { closeXml, crownXml, Icon, leafXml, starXml } from './icons';
import { LevelStop, MARKER, MARKER_BOX, MARKER_LIFT, NODE, PathFog, pathLayout, PathWorld } from './LevelPath';
import { Raised } from './Raised';

const SHOW_MS = 260;
const HIDE_MS = 200;
const BOB_MS = 900;
/** The sign and the close button, under the status bar. */
const HEAD_H = 64;
const LEAF = leafXml(worldColors.leaf, worldColors.leafL);
const CROWN = crownXml();
const PILL_CROWN = crownXml('#fff', '#fff3cc');

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
  const level = progress.level;
  const top = level >= LEVELS.length;
  // The world runs under the sign and the card; the player's stop sits in the middle of what's between them
  const [sheetH, setSheetH] = useState(0);
  const [footH, setFootH] = useState(0);
  const center = (insets.top + HEAD_H + sheetH - footH) / 2;
  const layout = useMemo(
    () => (sheetH && footH ? pathLayout(width, sheetH - center, center, Math.max(best, level)) : null),
    [width, sheetH, footH, center, best, level],
  );
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

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => setSheetH(Math.round(e.nativeEvent.layout.height)), []);
  const onFootLayout = useCallback((e: LayoutChangeEvent) => setFootH(Math.round(e.nativeEvent.layout.height)), []);

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
      onLayout={onSheetLayout}
      accessibilityViewIsModal
    >
      {layout && here && (
        <ScrollView
          style={StyleSheet.absoluteFill}
          showsVerticalScrollIndicator={false}
          // Bands of the world scrolled far off screen give their memory back
          removeClippedSubviews
          // Open on the player's stop, the character in the middle of the view
          contentOffset={{ x: 0, y: Math.max(0, here.y - MARKER_LIFT / 2 - center) }}
          accessible
          accessibilityLabel={
            top ? t('levelMap.a11y.top', { level }) : t('levelMap.a11y.path', { level, best: Math.max(best, level) })
          }
        >
          <View style={{ width, height: layout.height }}>
            <PathWorld id="levelMapWorld" layout={layout} />
            {layout.stops.map((p, i) => (
              <View key={i} style={[styles.stop, { left: p.x - NODE / 2, top: p.y - NODE / 2 }]}>
                <LevelStop level={i + 1} reached={i < level} />
              </View>
            ))}
            {layout.more && <PathFog id="levelMapFog" layout={layout} />}
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
              {top && (
                <View style={styles.crown} pointerEvents="none">
                  <Icon xml={CROWN} size={26} height={20} />
                </View>
              )}
            </Animated.View>
          </View>
        </ScrollView>
      )}

      <View style={[styles.head, { marginTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.headSide} />
        <View style={styles.signRow}>
          <Icon xml={LEAF} size={24} height={15} />
          <Raised depth={4} shadowColor={worldColors.signD} radius={16} style={styles.sign}>
            <Text style={styles.title} accessibilityRole="header">
              {t('levelMap.title')}
            </Text>
          </Raised>
          <View style={styles.flip}>
            <Icon xml={LEAF} size={24} height={15} />
          </View>
        </View>
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

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]} onLayout={onFootLayout}>
        <Raised depth={5} shadowColor={colors.shadow} radius={22} style={styles.card}>
          <View style={styles.cardRow}>
            <Raised depth={3} shadowColor={c.dark} radius={14} style={[styles.level, { backgroundColor: c.main }]}>
              {top ? <Icon xml={PILL_CROWN} size={19} height={15} /> : <Icon xml={starXml('#fff')} size={16} />}
              <Text style={styles.levelText}>{t('levelMap.here', { level })}</Text>
            </Raised>
            <Text style={styles.count}>
              {toNext !== null
                ? `${progress.wins} / ${total}`
                : t(progress.wins === 1 ? 'levelMap.topWordsOne' : 'levelMap.topWords', { count: progress.wins })}
            </Text>
          </View>
          {toNext !== null && (
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${(progress.wins / total) * 100}%`, backgroundColor: c.main }]} />
            </View>
          )}
          <Text style={[styles.next, top && { color: c.dark, fontSize: 15 }]}>{nextLine(progress, best)}</Text>
          {top && <Text style={styles.next}>{t('levelMap.topPay', { count: levelByNumber(level).tokenReward })}</Text>}
        </Raised>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Over the level-change card (zIndex 10) and the result's stamp (zIndex 2), see play-screen.md
  sheet: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: worldColors.mist },
  head: { height: HEAD_H, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  headSide: { width: 44, alignItems: 'flex-end' },
  signRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sign: { backgroundColor: worldColors.sign, borderWidth: 2, borderColor: worldColors.signD, paddingHorizontal: 20, paddingVertical: 3, marginHorizontal: -5 },
  flip: { transform: [{ scaleX: -1 }] },
  title: { fontFamily: fonts.display700, fontSize: 25, color: colors.ink },
  close: { width: 40, height: 40, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stop: { position: 'absolute', width: NODE, height: NODE },
  marker: { position: 'absolute' },
  // On the character's head, tilted like a hat worn at an angle (a flat 2D rotate)
  crown: { position: 'absolute', top: -15, left: MARKER_BOX / 2 - 13, transform: [{ rotate: '-12deg' }] },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  card: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, padding: 14, gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  level: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingLeft: 9, paddingRight: 13 },
  levelText: { fontFamily: fonts.display600, fontSize: 17, color: '#fff' },
  count: { fontFamily: fonts.display600, fontSize: 15, color: colors.muted },
  bar: { height: 12, borderRadius: 6, backgroundColor: colors.track, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  next: { fontFamily: fonts.body800, fontSize: 14, color: colors.muted, textAlign: 'center' },
});
