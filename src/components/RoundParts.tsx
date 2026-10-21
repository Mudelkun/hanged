/*
 * The pieces between the scene and the keyboard: miss pips, word tiles,
 * the description card and the "Next token" bar. Sizes and colours follow
 * design/ui-mockup.html (.misses, .tiles, .desc, .tokbar).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { DESCRIPTION_COST, WORDS_PER_TOKEN } from '../game/config';
import { t } from '../i18n';
import { colors, fonts } from '../theme';
import { bulbXml, coinXml, Icon, lockXml, sparkXml } from './icons';
import { Raised } from './Raised';

// ---- misses ----

export function MissesBar({ wrong, max }: { wrong: number; max: number }) {
  return (
    <View style={styles.misses}>
      <View style={styles.pips}>
        {Array.from({ length: max }, (_, i) => (
          <View key={i} style={[styles.pip, i < wrong && styles.pipOn]} />
        ))}
      </View>
      <Text style={styles.missText}>
        <Text style={styles.missCount}>{wrong}</Text> {t('play.misses', { max })}
      </Text>
    </View>
  );
}

// ---- tiles ----

export type TileLook = 'hidden' | 'clue' | 'ok' | 'miss';

const TILE_LOOK = {
  ok: { bg: colors.mintL, border: '#bdecd6', shadow: '#a5dfc4', text: colors.mintT },
  clue: { bg: colors.butterL, border: '#ffe39a', shadow: '#f2d27a', text: colors.butterT },
  miss: { bg: colors.coralL, border: '#ffcfc5', shadow: '#f6b8ab', text: colors.coralD },
};

function Tile({ letter, look, w, h }: { letter: string; look: TileLook; w: number; h: number }) {
  const [pop] = useState(() => new Animated.Value(1));
  // Pop when the tile turns over during play, not when it first appears
  const prevLook = useRef(look);
  useEffect(() => {
    if (look === prevLook.current) return;
    prevLook.current = look;
    if (look === 'hidden') return;
    pop.setValue(0.55);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [look, pop]);

  const radius = Math.round(w * 0.32);
  if (look === 'hidden') {
    return (
      <View
        accessible
        accessibilityLabel={t('play.a11y.tile.hidden')}
        style={[styles.tileHidden, { width: w, height: h, borderRadius: radius, marginTop: 4 }]}
      >
        <View style={[styles.tileDash, { bottom: h * 0.17, width: w * 0.4 }]} />
      </View>
    );
  }
  const c = TILE_LOOK[look];
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Raised shadowColor={c.shadow} radius={radius} style={[styles.tile, { width: w, height: h, backgroundColor: c.bg, borderColor: c.border }]}>
        <Text style={[styles.tileText, { fontSize: Math.round(w * 0.6), color: c.text }]}>{letter.toUpperCase()}</Text>
      </Raised>
      {look === 'clue' && (
        <View style={styles.spark} pointerEvents="none">
          <Icon xml={sparkXml()} size={18} />
        </View>
      )}
    </Animated.View>
  );
}

/**
 * The word as tiles. Words over 8 letters wrap onto two rows so a 15-letter
 * word stays readable on a phone.
 */
export function WordTiles({ letters, available, compact }: { letters: { letter: string; look: TileLook }[]; available: number; compact: boolean }) {
  const n = letters.length;
  const rows = n > 8 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const gap = perRow > 6 ? 6 : 8;
  const w = Math.floor(Math.min(50, (available - gap * (perRow - 1)) / perRow));
  const maxH = compact || rows > 1 ? 48 : 58;
  const h = Math.min(maxH, Math.round(w * 1.16));
  const chunks = rows === 1 ? [letters] : [letters.slice(0, perRow), letters.slice(perRow)];
  return (
    <View style={[styles.tiles, compact && { marginVertical: 9 }]}>
      {chunks.map((row, r) => (
        <View key={r} style={[styles.tileRow, { gap }]}>
          {row.map((l, i) => (
            <Tile key={i} letter={l.letter} look={l.look} w={w} h={h} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ---- description ----

interface DescriptionProps {
  text: string;
  unlocked: boolean;
  /** null: no unlock button (round over). */
  canAfford: boolean | null;
  onUnlock?: () => void;
  compact?: boolean;
}

export function DescriptionCard({ text, unlocked, canAfford, onUnlock, compact }: DescriptionProps) {
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!refused) return;
    const id = setTimeout(() => setRefused(false), 2200);
    return () => clearTimeout(id);
  }, [refused]);

  const press = () => {
    if (canAfford) onUnlock?.();
    else setRefused(true);
  };

  return (
    <Raised shadowColor={colors.shadow} radius={22} style={[styles.desc, compact && { paddingVertical: 7 }]}>
      <View style={styles.bulb}>
        <Icon xml={bulbXml} size={24} />
      </View>
      <View style={styles.descBody}>
        <Text style={styles.chip}>{t('description.label')}</Text>
        {unlocked ? (
          <Text style={styles.descText} numberOfLines={3}>
            {text}
          </Text>
        ) : refused ? (
          <Text style={[styles.descText, { color: colors.coralD }]}>{t('description.notEnough')}</Text>
        ) : (
          // Placeholder text, blurred: the real hint is never on screen until it is paid for
          <Text style={styles.blurred} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no">
            {t('description.hiddenPlaceholder')}
          </Text>
        )}
      </View>
      {!unlocked && canAfford !== null && (
        <Pressable
          onPress={press}
          accessibilityRole="button"
          accessibilityLabel={t('description.a11y.unlock', { cost: DESCRIPTION_COST })}
          accessibilityState={{ disabled: !canAfford }}
        >
          {({ pressed }) => (
            <Raised
              shadowColor={canAfford ? colors.coralD : '#dccbb8'}
              radius={15}
              pressed={pressed}
              style={[styles.unlock, !canAfford && { backgroundColor: '#e9dccd' }]}
            >
              <Icon xml={lockXml('#fff')} size={15} />
              <Text style={styles.unlockText}>{t('description.unlock', { cost: DESCRIPTION_COST })}</Text>
              <Icon xml={coinXml} size={18} />
            </Raised>
          )}
        </Pressable>
      )}
    </Raised>
  );
}

// ---- next token ----

export function TokenBar({ progress }: { progress: number }) {
  const [width] = useState(() => new Animated.Value(progress / WORDS_PER_TOKEN));
  useEffect(() => {
    Animated.timing(width, { toValue: progress / WORDS_PER_TOKEN, duration: 500, useNativeDriver: false }).start();
  }, [progress, width]);
  return (
    <View style={styles.tokbar}>
      <Icon xml={coinXml} size={18} />
      <Text style={styles.tokText}>{t('tokens.next')}</Text>
      <View style={styles.track}>
        <Animated.View
          style={[styles.fill, { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      </View>
      <Text style={styles.tokText}>{t('tokens.progress', { count: progress, total: WORDS_PER_TOKEN })}</Text>
    </View>
  );
}

// ---- big button ----

export function BigButton({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <Raised
          depth={5}
          pressed={pressed}
          shadowColor={ghost ? colors.shadow : colors.coralD}
          radius={20}
          outerStyle={{ marginVertical: 8 }}
          style={[styles.btn, ghost && styles.btnGhost]}
        >
          <Text style={[styles.btnText, ghost && { color: colors.coralD }]}>{label}</Text>
        </Raised>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  misses: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11, marginHorizontal: 4 },
  pips: { flex: 1, flexDirection: 'row', gap: 4 },
  pip: { flex: 1, height: 11, borderRadius: 6, backgroundColor: colors.track },
  pipOn: { backgroundColor: colors.coral, borderBottomWidth: 2.5, borderBottomColor: colors.coralD },
  missText: { fontFamily: fonts.display600, fontSize: 14, color: colors.muted },
  missCount: { color: colors.coralD },

  tiles: { marginVertical: 13, gap: 8, alignItems: 'center' },
  tileRow: { flexDirection: 'row', justifyContent: 'center' },
  tile: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontFamily: fonts.display700 },
  tileHidden: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: '#e6d1b8',
    alignItems: 'center',
  },
  tileDash: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#ead9c4' },
  spark: { position: 'absolute', top: -7, right: -7 },

  desc: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.line,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 66,
  },
  bulb: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.butterL, alignItems: 'center', justifyContent: 'center' },
  descBody: { flex: 1, minWidth: 0 },
  chip: { fontFamily: fonts.display600, fontSize: 12, letterSpacing: 1, color: colors.butterT },
  descText: { fontFamily: fonts.body800, fontSize: 14, color: colors.ink, marginTop: 1 },
  blurred: {
    fontFamily: fonts.body800,
    fontSize: 14.5,
    marginTop: 3,
    color: 'transparent',
    textShadowColor: 'rgba(109,90,82,0.85)',
    textShadowRadius: 7,
    textShadowOffset: { width: 0, height: 0 },
  },
  unlock: {
    backgroundColor: colors.coral,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  unlockText: { fontFamily: fonts.display600, fontSize: 15, color: '#fff' },

  tokbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, marginHorizontal: 4 },
  tokText: { fontFamily: fonts.display600, fontSize: 13.5, color: colors.muted },
  track: { flex: 1, height: 12, borderRadius: 7, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.butter, borderRadius: 7, borderBottomWidth: 3, borderBottomColor: '#f5c94a' },

  btn: { height: 56, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line },
  btnText: { fontFamily: fonts.display600, fontSize: 20, color: '#fff', letterSpacing: 0.2 },
});
