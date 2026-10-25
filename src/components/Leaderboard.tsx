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
import { arrowXml, cloudXml, crownXml, Icon, medalXml, sparkXml } from './icons';
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

/**
 * The top 3: gold, silver, bronze. Each tints its whole row (`card`, `edge`,
 * `depth`) and wears a ribbon medal (`xml`) with the rank in `text`.
 */
const MEDALS = [
  { ring: '#ffc93c', ringD: '#e0a020', face: '#ffe58a', ribbon: '#ff5d5d', ribbonD: '#c93b3b', text: '#b07800', card: '#fff2bd', edge: '#ffcf4a', depth: '#f0b43a', spark: '#ffc93c' },
  { ring: '#b9cde0', ringD: '#8fa9c2', face: '#e9f1f9', ribbon: '#4aa3f0', ribbonD: '#2a7cc4', text: '#5a7d9c', card: '#e2f1ff', edge: '#8ec8f6', depth: '#6cb0ea', spark: '#8ec8f6' },
  { ring: '#f2a36e', ringD: '#d47f45', face: '#ffd6b8', ribbon: '#ff6f5a', ribbonD: '#cf4c3a', text: '#b0582a', card: '#ffe4d4', edge: '#f7a87e', depth: '#e98d5f', spark: '#ffa36b' },
].map((m) => ({ ...m, xml: medalXml(m), sparkXml: sparkXml(m.spark) }));

/** Fixed row heights, so the list can jump straight to any row (`getItemLayout`). */
const ROW = { height: 60, depth: 3 };
const ME_ROW = { height: 68, depth: 4 };
const TOP_ROW = { height: 76, depth: 4 };
const ROW_GAP = 10;
/** The dotted break above the player's own row when it's pinned under the top. */
const PIN_GAP = 30;
/** How far the first row's crown rises above it: the list starts this much lower. */
export const CROWN_RISE = 12;

const sizeOf = (e: Ranked) => (e.rank <= MEDALS.length ? TOP_ROW : e.me ? ME_ROW : ROW);

/** The height a row takes in the list, gaps included. */
export const rowSpan = (e: Ranked) => {
  const r = sizeOf(e);
  return r.height + r.depth + ROW_GAP + (e.pinned ? PIN_GAP : 0);
};

function RankChip({ rank, me }: { rank: number; me: boolean }) {
  if (!me) {
    return (
      <Text style={styles.rank} numberOfLines={1} adjustsFontSizeToFit>
        {rank}
      </Text>
    );
  }
  return (
    <View style={styles.chipMe}>
      <Text style={styles.chipMeText} numberOfLines={1}>
        {rank}
      </Text>
    </View>
  );
}

const MEDAL_W = 68;
const MEDAL_SCALE = MEDAL_W / 64;
const CROWN = crownXml();

/** The top 3's ribbon medal, centred on the row's height, the crown on #1. Drawn over the row, unclipped. */
function Medal({ rank, rowHeight }: { rank: number; rowHeight: number }) {
  const m = MEDALS[rank - 1];
  return (
    <View pointerEvents="none" style={[styles.medalBox, { top: rowHeight / 2 - 31 * MEDAL_SCALE }]}>
      {rank === 1 && (
        <View style={styles.crown}>
          <Icon xml={CROWN} size={32} height={25} />
        </View>
      )}
      <Icon xml={m.xml} size={MEDAL_W} height={74 * MEDAL_SCALE} />
      <Text style={[styles.medalNum, { color: m.text }]}>{rank}</Text>
      <View style={[styles.deco, { left: MEDAL_W - 6, top: 0 }]}>
        <Icon xml={m.sparkXml} size={15} />
      </View>
      <View style={[styles.deco, { left: MEDAL_W - 8, top: 50 }]}>
        <Icon xml={m.sparkXml} size={11} />
      </View>
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
  const r = sizeOf(entry);
  const medal = MEDALS[entry.rank - 1];
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
          shadowColor={me ? colors.coralD : medal ? medal.depth : colors.shadow}
          radius={me || medal ? 24 : 20}
          style={[
            styles.row,
            { height: r.height },
            medal && [styles.rowTop, { backgroundColor: medal.card, borderColor: medal.edge }],
            me && styles.rowMe,
          ]}
        >
          {me && !medal && (
            <View style={[styles.deco, { left: 98, top: 4 }]}>
              <Icon xml={SPARK} size={14} />
            </View>
          )}
          {(me || medal) && (
            <View style={[styles.deco, { right: 12, top: 6 }]}>
              <Icon xml={me ? SPARK_PINK : medal.sparkXml} size={12} />
            </View>
          )}
          {medal && !me && entry.rank === 1 && (
            <View style={[styles.deco, { right: 34, bottom: 6 }]}>
              <Icon xml={medal.sparkXml} size={11} />
            </View>
          )}
          {!medal && <RankChip rank={entry.rank} me={me} />}
          <Avatar character={entry.character} size={me ? 52 : medal ? 48 : 44} plain={!me} />
          <View style={styles.rowName}>
            <Text style={[styles.rowNameText, me && styles.rowNameMe]} numberOfLines={1}>
              {entry.name}
            </Text>
            {me && <You />}
          </View>
          <Score words={entry.words} me={me} />
        </Raised>
        {medal && <Medal rank={entry.rank} rowHeight={r.height} />}
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
  chipMe: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chipMeText: display('700', 17, colors.coralD),
  medalBox: { position: 'absolute', left: 6, width: MEDAL_W },
  crown: { position: 'absolute', top: -CROWN_RISE - 4, left: (MEDAL_W - 32) / 2 },
  medalNum: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 31 * MEDAL_SCALE - 19,
    lineHeight: 38,
    textAlign: 'center',
    ...display('700', 30),
    textShadowColor: '#fff',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 0,
  },

  you: { borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1 },
  youText: { ...display('700', 11, '#fff'), letterSpacing: 0.5 },

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
  // Room on the left for the medal, drawn over the row
  rowTop: { borderWidth: 2.5, paddingLeft: MEDAL_W + 12 },
  rowMe: { backgroundColor: colors.coral, borderWidth: 3, borderColor: '#fff', gap: 10 },
  rank: { width: 32, textAlign: 'center', ...display('700', 18, '#c4ad9b') },
  rowName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowNameText: { ...display('700', 17.5), flexShrink: 1 },
  rowNameMe: display('700', 19, '#fff'),
  rowScore: display('700', 25),
  rowScoreMe: { color: '#fff', fontSize: 27 },
  rowUnit: display('600', 13, colors.muted),
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
