/*
 * The Leaderboard's parts, after the mockup (design/ui-mockup.html,
 * "leaderboard"): the This week / All time switch, the podium of the top 3
 * standing on their blocks under a sky, and a row per player after that.
 * The player's own entry wears the YOU badge.
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, SvgXml } from 'react-native-svg';

import type { Period } from '../../server/src/contract';
import { bodyXml, Character } from '../characters/rig';
import { useTranslation } from '../i18n';
import { sound } from '../audio';
import { colors, fonts } from '../theme';
import { Avatar } from './GameHeader';
import { cloudXml, Icon, sparkXml } from './icons';
import { Raised } from './Raised';

/** A board entry ready to draw: the player's own entry already shows their local name and character. */
export interface Ranked {
  rank: number;
  name: string;
  character: Character;
  words: number;
  me: boolean;
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

function Score({ words, big }: { words: number; big?: boolean }) {
  const t = useTranslation();
  return (
    <Text style={big ? styles.podiumScore : styles.rowScore}>
      {words}
      <Text style={big ? styles.podiumUnit : styles.rowUnit}> {t(words === 1 ? 'board.word' : 'board.words')}</Text>
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

/** Podium places, left to right: 2nd, 1st, 3rd. */
const PLACES = [
  { at: 1, figure: 92, block: 96, top: '#e3f1fb', bottom: '#cfe4f4', medal: '#5a7d9c' },
  { at: 0, figure: 104, block: 112, top: '#ffe48a', bottom: '#ffd25c', medal: '#c48a00' },
  { at: 2, figure: 86, block: 84, top: '#ffd8bf', bottom: '#ffc4a1', medal: '#c0663a' },
];

const PodiumPlace = memo(function PodiumPlace({ entry, place }: { entry: Ranked; place: (typeof PLACES)[number] }) {
  const t = useTranslation();
  const xml = useMemo(
    () => bodyXml(entry.character, place.at === 0 ? { pose: 'cheer', expr: 'joy' } : { expr: entry.me ? 'joy' : 'happy' }),
    [entry.character, entry.me, place.at],
  );
  const id = `podium${place.at}`;
  return (
    <View
      style={styles.place}
      accessible
      accessibilityLabel={t('board.a11y.row', { rank: entry.rank, name: entry.name, count: entry.words })}
    >
      <SvgXml xml={xml} width={(place.figure * 220) / 260} height={place.figure} style={styles.figure} />
      <View style={[styles.block, { height: place.block }]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={place.top} />
              <Stop offset="1" stopColor={place.bottom} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
        <View style={styles.medal}>
          <Text style={[styles.medalText, { color: place.medal }]}>{entry.rank}</Text>
        </View>
        <View style={styles.podiumName}>
          <Text style={styles.podiumNameText} numberOfLines={1}>
            {entry.name}
          </Text>
          {entry.me && <You />}
        </View>
        <Score words={entry.words} big />
      </View>
    </View>
  );
});

/** The top 3 under a sky; a missing place stays empty. */
export function Podium({ top }: { top: Ranked[] }) {
  return (
    <Raised shadowColor={colors.shadow} radius={28} outerStyle={styles.podiumOuter} style={styles.podiumCard}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="podiumSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#c9ebff" />
            <Stop offset="0.6" stopColor="#e9f7ff" />
            <Stop offset="1" stopColor="#fff7ec" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#podiumSky)" />
      </Svg>
      <View style={[styles.deco, { left: 14, top: 14, opacity: 0.9 }]}>
        <Icon xml={cloudXml()} size={60} height={30} />
      </View>
      <View style={[styles.deco, { right: 18, top: 30, opacity: 0.8 }]}>
        <Icon xml={cloudXml()} size={46} height={23} />
      </View>
      <View style={[styles.deco, { left: '40%', top: 10 }]}>
        <Icon xml={sparkXml()} size={16} />
      </View>
      <View style={[styles.deco, { right: '32%', top: 8 }]}>
        <Icon xml={sparkXml('#ff9fbf')} size={12} />
      </View>
      <View style={styles.podium}>
        {PLACES.map((place) => {
          const entry = top[place.at];
          return entry ? <PodiumPlace key={place.at} entry={entry} place={place} /> : <View key={place.at} style={styles.place} />;
        })}
      </View>
    </Raised>
  );
}

export const RankRow = memo(function RankRow({ entry }: { entry: Ranked }) {
  const t = useTranslation();
  return (
    <View accessible accessibilityLabel={t('board.a11y.row', { rank: entry.rank, name: entry.name, count: entry.words })}>
      <Raised depth={3} shadowColor={colors.shadow} radius={20} outerStyle={styles.rowOuter} style={[styles.row, entry.me && styles.rowMe]}>
        <Text style={styles.rank}>{entry.rank}</Text>
        <Avatar character={entry.character} size={42} plain />
        <View style={styles.rowName}>
          <Text style={styles.rowNameText} numberOfLines={1}>
            {entry.name}
          </Text>
          {entry.me && <You />}
        </View>
        <Score words={entry.words} />
      </Raised>
    </View>
  );
});

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
  seg: { flexDirection: 'row', backgroundColor: '#f6ebdd', borderRadius: 19, padding: 5 },
  segItem: { flex: 1 },
  segInner: { alignItems: 'center', paddingVertical: 9 },
  segOn: { backgroundColor: '#fff' },
  segText: display('600', 15.5, '#b29c8c'),
  segTextOn: { color: colors.coralD },

  podiumOuter: { marginTop: 10 },
  podiumCard: {
    borderWidth: 3,
    borderColor: '#fff',
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  deco: { position: 'absolute' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  place: { flex: 1, maxWidth: 110, alignItems: 'center' },
  figure: { marginBottom: -6, zIndex: 1 },
  block: { width: '100%', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, overflow: 'hidden', alignItems: 'center', paddingTop: 8, paddingHorizontal: 4 },
  medal: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  medalText: display('700', 16),
  podiumName: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  podiumNameText: { ...display('600', 15), flexShrink: 1 },
  podiumScore: { ...display('700', 19), marginTop: 1 },
  podiumUnit: display('600', 11, 'rgba(75,58,53,0.6)'),

  you: { backgroundColor: colors.coral, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  youText: { ...display('600', 10.5, '#fff'), letterSpacing: 0.4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  rowOuter: { marginBottom: 8 },
  rowMe: { borderColor: colors.coral, backgroundColor: '#fff6f4' },
  rank: { width: 28, textAlign: 'center', ...display('700', 17, '#c4ad9b') },
  rowName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowNameText: { ...display('600', 17), flexShrink: 1 },
  rowScore: display('700', 21),
  rowUnit: display('600', 12, colors.muted),

  note: { marginTop: 24, alignItems: 'center', paddingHorizontal: 24, gap: 8 },
  noteTitle: display('700', 20),
  noteBody: { fontFamily: fonts.body700, fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center' },
  noteButton: { marginTop: 8, backgroundColor: colors.coral, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 22 },
  noteButtonText: display('600', 16, '#fff'),
});
