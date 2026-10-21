/*
 * The pieces between the scene and the keyboard: miss pips, word tiles,
 * the hint pill and the description card. Sizes and colours follow
 * design/ui-mockup.html (.misses, .tiles, .desc).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { DESCRIPTION_COST } from '../game/config';
import { t } from '../i18n';
import { colors, fonts } from '../theme';
import { bulbXml, coinXml, eyeXml, Icon, lockXml, nextXml, sparkXml } from './icons';
import { popFrom } from './motion';
import { Raised } from './Raised';
import { useTokenOrigin } from './TokenFlight';

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
    popFrom(pop, 0.55);
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
  // The sparkle scales down with small tiles so it doesn't cover the letter
  const spark = Math.min(18, Math.round(w * 0.45));
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Raised shadowColor={c.shadow} radius={radius} style={[styles.tile, { width: w, height: h, backgroundColor: c.bg, borderColor: c.border }]}>
        <Text style={[styles.tileText, { fontSize: Math.round(w * 0.6), color: c.text }]}>{letter.toUpperCase()}</Text>
      </Raised>
      {look === 'clue' && (
        <View style={[styles.spark, { top: -spark * 0.4, right: -spark * 0.4 }]} pointerEvents="none">
          <Icon xml={sparkXml()} size={spark} />
        </View>
      )}
    </Animated.View>
  );
}

/**
 * The word as tiles, always on one row: long words shrink the tiles (and the
 * gap) instead of wrapping, so a 15-letter word still reads as one word.
 */
export function WordTiles({ letters, available, compact }: { letters: { letter: string; look: TileLook }[]; available: number; compact: boolean }) {
  const n = letters.length;
  const gap = n > 10 ? 3 : n > 6 ? 6 : 8;
  const w = Math.floor(Math.min(50, (available - gap * (n - 1)) / n));
  const h = Math.min(compact ? 48 : 58, Math.round(w * 1.16));
  return (
    <View style={[styles.tiles, styles.tileRow, { gap }, compact && { marginVertical: 9 }]}>
      {letters.map((l, i) => (
        <Tile key={i} letter={l.letter} look={l.look} w={w} h={h} />
      ))}
    </View>
  );
}

// ---- hint words ----

/**
 * Free one-word hints (not in the mockup). Hidden until the player taps;
 * then each tap shows the next one, looping back to the first. Give it a
 * key per round so it hides again for every new word.
 */
export function HintPill({ hints, compact }: { hints: readonly string[]; compact?: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  const [pop] = useState(() => new Animated.Value(1));
  if (hints.length === 0) return null;

  const total = hints.length;
  const shown = index !== null;
  const press = () => {
    setIndex((i) => (i === null ? 0 : (i + 1) % total));
    popFrom(pop, 0.6);
  };

  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={
        shown ? t('hint.a11y.word', { index: index + 1, total, word: hints[index] }) : t('hint.a11y.show')
      }
    >
      {({ pressed }) => (
        <Raised
          shadowColor={colors.shadow}
          radius={16}
          pressed={pressed}
          outerStyle={{ marginBottom: compact ? 7 : 10 }}
          style={[styles.hint, compact && { height: 36 }]}
        >
          <Text style={styles.hintChip}>{t('hint.label')}</Text>
          {shown ? (
            <Animated.Text style={[styles.hintWord, { transform: [{ scale: pop }] }]} numberOfLines={1}>
              {hints[index].toUpperCase()}
            </Animated.Text>
          ) : (
            <Text style={styles.hintTap} numberOfLines={1}>
              {t('hint.tapToShow')}
            </Text>
          )}
          {shown && total > 1 && <Text style={styles.hintCount}>{t('hint.count', { index: index + 1, total })}</Text>}
          <View style={styles.hintBtn}>
            <Icon xml={shown ? nextXml() : eyeXml()} size={16} />
          </View>
        </Raised>
      )}
    </Pressable>
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
  const [unlockRef, sendToken] = useTokenOrigin();
  useEffect(() => {
    if (!refused) return;
    const id = setTimeout(() => setRefused(false), 2200);
    return () => clearTimeout(id);
  }, [refused]);

  const press = () => {
    // Measure the button before unlocking: it's gone once the description shows
    if (canAfford) sendToken(-1).then(() => onUnlock?.());
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
          ref={unlockRef}
          collapsable={false}
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
  spark: { position: 'absolute' },

  hint: {
    height: 40,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.line,
    paddingLeft: 6,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hintChip: {
    fontFamily: fonts.display600,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.skyT,
    backgroundColor: colors.skyL,
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hintWord: { flex: 1, fontFamily: fonts.display700, fontSize: 18, letterSpacing: 1.5, color: colors.ink },
  hintTap: { flex: 1, fontFamily: fonts.body800, fontSize: 14, color: colors.muted },
  hintCount: { fontFamily: fonts.display600, fontSize: 13.5, color: colors.muted },
  hintBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' },

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

  btn: { height: 56, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line },
  btnText: { fontFamily: fonts.display600, fontSize: 20, color: '#fff', letterSpacing: 0.2 },
});
