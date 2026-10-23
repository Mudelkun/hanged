/*
 * The Leaderboard's parts: the This week / All time switch and one row per
 * player. The top 3 wear gold, silver and bronze medals (no podium: the
 * owner's call). The player's own row is coral with the YOU badge, and the
 * floating Find-me pill scrolls to it.
 */
import { memo, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Period } from '../../server/src/contract';
import { Character } from '../characters/rig';
import { useTranslation } from '../i18n';
import { sound } from '../audio';
import { colors, fonts } from '../theme';
import { Avatar } from './GameHeader';
import { arrowXml, cloudXml, Icon, sparkXml } from './icons';
import { Raised } from './Raised';

/** A board entry ready to draw: the player's own entry already shows their local name and character. */
export interface Ranked {
  rank: number;
  name: string;
  character: Character;
  words: number;
  me: boolean;
  /** Ranked outside the top: drawn under it, after a dotted break. */
  pinned?: boolean;
}

const PERIODS: { id: Period; label: 'board.week' | 'board.all' }[] = [
  { id: 'week', label: 'board.week' },
  { id: 'all', label: 'board.all' },
];

export function PeriodSwitch({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const t = useTranslation();
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {PERIODS.map((p) => {
        const on = p.id === period;
        return (
          <Pressable
            key={p.id}
            style={styles.segItem}
            onPress={() => { if (p.id !== period) { sound.play('period'); onChange(p.id); } }}
            disabled={on}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Raised depth={on ? 3 : 0} shadowColor={on ? colors.shadow : 'transparent'} radius={15} style={[styles.segInner, on && styles.segOn]}>
              <Text style={[styles.segText, on && styles.segTextOn]}>{t(p.label)}</Text>
            </Raised>
          </Pressable>
        );
      })}
    </View>
  );
}

function Score({ words, me }: { words: number; me: boolean }) {
  const t = useTranslation();
  return (
    <Text style={[styles.rowScore, me && styles.rowScoreMe]}>
      {words}
      <Text style={[styles.rowUnit, me && styles.rowUnitMe]}> {t(words === 1 ? 'board.word' : 'board.words')}</Text>
    </Text>
  );
}

function You() {
  const t = useTranslation();
  return (
    <View style={styles.you}>
      <Text style={styles.youText}>{t('board.you')}</Text>
    </View>
  );
}

/** Medal colours for the top 3: gold, silver, bronze. */
const MEDALS = [
  { fill: '#ffd667', edge: '#f0b43a', text: '#9a6a00' },
  { fill: '#e6eef6', edge: '#bccddd', text: '#5a7d9c' },
  { fill: '#ffd8bf', edge: '#f2b08a', text: '#c0663a' },
];

/** Fixed row heights, so the list can jump straight to any row (`getItemLayout`). */
const ROW = { height: 58, depth: 3 };
const ME_ROW = { height: 72, depth: 4 };
const ROW_GAP = 8;
/** The dotted break above the player's own row when it's pinned under the top. */
const PIN_GAP = 30;

/** The height a row takes in the list, gaps included. */
export const rowSpan = (e: Ranked) => {
  const r = e.me ? ME_ROW : ROW;
  return r.height + r.depth + ROW_GAP + (e.pinned ? PIN_GAP : 0);
};

function RankChip({ rank, me }: { rank: number; me: boolean }) {
  const medal = MEDALS[rank - 1];
  if (!medal && !me) {
    return (
      <Text style={styles.rank} numberOfLines={1} adjustsFontSizeToFit>
        {rank}
      </Text>
    );
  }
  return (
    <View style={[styles.medal, medal ? { backgroundColor: medal.fill, borderColor: medal.edge } : styles.medalMe]}>
      <Text style={[styles.medalText, { color: medal ? medal.text : colors.coralD }]} numberOfLines={1}>
        {rank}
      </Text>
    </View>
  );
}

const SPARK = sparkXml();
const SPARK_PINK = sparkXml('#ffd1dc');

/**
 * One player. The player's own row is the star of the board: coral, taller,
 * with sparkles, and it pops each time `flash` grows (the Find-me button).
 */
export const RankRow = memo(function RankRow({ entry, flash = 0 }: { entry: Ranked; flash?: number }) {
  const t = useTranslation();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!flash) return;
    scale.setValue(1);
    // Waits for the scroll to land first
    Animated.sequence([
      Animated.delay(320),
      Animated.timing(scale, { toValue: 1.06, duration: 110, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
  }, [flash, scale]);
  const { me } = entry;
  const r = me ? ME_ROW : ROW;
  return (
    <View style={{ height: rowSpan(entry) }}>
      {entry.pinned && (
        <View style={styles.pinGap}>
          {[0, 1, 2].map((i) => <View key={i} style={styles.pinDot} />)}
        </View>
      )}
      <Animated.View
        accessible
        accessibilityLabel={t('board.a11y.row', { rank: entry.rank, name: entry.name, count: entry.words })}
        style={{ transform: [{ scale }] }}
      >
        <Raised
          depth={r.depth}
          shadowColor={me ? colors.coralD : colors.shadow}
          radius={me ? 24 : 20}
          style={[styles.row, { height: r.height }, me && styles.rowMe]}
        >
          {me && (
            <>
              <View style={[styles.deco, { left: 92, top: 6 }]}>
                <Icon xml={SPARK} size={13} />
              </View>
              <View style={[styles.deco, { right: 10, top: 5 }]}>
                <Icon xml={SPARK_PINK} size={10} />
              </View>
            </>
          )}
          <RankChip rank={entry.rank} me={me} />
          <Avatar character={entry.character} size={me ? 50 : 42} plain={!me} />
          <View style={styles.rowName}>
            <Text style={[styles.rowNameText, me && styles.rowNameMe]} numberOfLines={1}>
              {entry.name}
            </Text>
            {me && <You />}
          </View>
          <Score words={entry.words} me={me} />
        </Raised>
      </Animated.View>
    </View>
  );
});

const ARROW = { up: arrowXml('up', colors.coralD), down: arrowXml('down', colors.coralD) };

/**
 * The floating Find-me pill. It shows while the player's own row is off
 * screen, its arrow points to it (`direction`), and tapping it scrolls there.
 */
export function FindMe({ entry, visible, direction, onPress }: { entry: Ranked; visible: boolean; direction: 'up' | 'down'; onPress: () => void }) {
  const t = useTranslation();
  const [shown] = useState(() => new Animated.Value(visible ? 1 : 0));
  useEffect(() => {
    Animated.spring(shown, { toValue: visible ? 1 : 0, friction: 6, tension: 140, useNativeDriver: true }).start();
  }, [visible, shown]);
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.findMe,
        {
          opacity: shown,
          transform: [
            { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!visible}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t('board.a11y.findMe', { rank: entry.rank })}
      >
        {({ pressed }) => (
          <Raised depth={4} pressed={pressed} shadowColor={colors.coralD} radius={26} style={styles.findMeInner}>
            <Avatar character={entry.character} size={32} plain />
            <Text style={styles.findMeText}>{t('board.findMe', { rank: entry.rank })}</Text>
            <View style={styles.findMeArrow}>
              <Icon xml={ARROW[direction]} size={14} />
            </View>
          </Raised>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** A card in place of the board: offline, empty, or loading. */
export function BoardNote({ title, body, action, onAction }: { title?: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.note}>
      <Icon xml={cloudXml(colors.skyL)} size={84} height={42} />
      {title && <Text style={styles.noteTitle}>{title}</Text>}
      <Text style={styles.noteBody}>{body}</Text>
      {action && (
        <Pressable onPress={onAction} accessibilityRole="button" style={({ pressed }) => [styles.noteButton, pressed && { opacity: 0.7 }]}>
          <Text style={styles.noteButtonText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const display = (weight: '600' | '700', fontSize: number, color: string = colors.ink) => ({
  fontFamily: weight === '600' ? fonts.display600 : fonts.display700,
  fontSize,
  color,
});

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: '#f6ebdd', borderRadius: 19, padding: 5, marginBottom: 12 },
  segItem: { flex: 1 },
  segInner: { alignItems: 'center', paddingVertical: 9 },
  segOn: { backgroundColor: '#fff' },
  segText: display('600', 15.5, '#b29c8c'),
  segTextOn: { color: colors.coralD },

  deco: { position: 'absolute' },
  // Grows into a pill for a long rank (the player's own row can be far down)
  medal: { minWidth: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  medalMe: { backgroundColor: '#fff', borderColor: '#fff' },
  medalText: display('700', 16),

  you: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  youText: { ...display('700', 10.5, colors.coralD), letterSpacing: 0.4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingLeft: 10,
    paddingRight: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  rowMe: { backgroundColor: colors.coral, borderWidth: 3, borderColor: '#fff', paddingLeft: 9, gap: 10 },
  rank: { width: 32, textAlign: 'center', ...display('700', 17, '#c4ad9b') },
  rowName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowNameText: { ...display('600', 17), flexShrink: 1 },
  rowNameMe: display('700', 18, '#fff'),
  rowScore: display('700', 21),
  rowScoreMe: { color: '#fff', fontSize: 23 },
  rowUnit: display('600', 12, colors.muted),
  rowUnitMe: { color: 'rgba(255,255,255,0.85)' },

  pinGap: { height: PIN_GAP, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 4 },
  pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.tabIdle },

  findMe: { position: 'absolute', bottom: 12, alignSelf: 'center' },
  findMeInner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.coral, paddingLeft: 5, paddingRight: 6, paddingVertical: 5 },
  findMeText: display('700', 16, '#fff'),
  findMeArrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  note: { marginTop: 24, alignItems: 'center', paddingHorizontal: 24, gap: 8 },
  noteTitle: display('700', 20),
  noteBody: { fontFamily: fonts.body700, fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center' },
  noteButton: { marginTop: 8, backgroundColor: colors.coral, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 22 },
  noteButtonText: display('600', 16, '#fff'),
});
