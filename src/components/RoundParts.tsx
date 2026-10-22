/*
 * The pieces between the scene and the keyboard: miss pips, word tiles,
 * the letter shop pill and the description card (the shop's pay
 * buttons: PayButton.tsx). Sizes and colours follow
 * design/ui-mockup.html (.misses, .tiles, .desc).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { LETTER_BUY_COST, LETTER_BUY_COUNT } from '../game/config';
import { t } from '../i18n';
import { colors, fonts } from '../theme';
import { bulbXml, eyeXml, Icon, sparkXml } from './icons';
import { popFrom } from './motion';
import { PayButton, useRefusal } from './PayButton';
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

// ---- letter shop (hardest levels) ----

/**
 * Not in the mockup. On levels that sell letters, the player can reveal
 * LETTER_BUY_COUNT hidden letters for LETTER_BUY_COST tokens, once per round.
 * The screen only shows the pill while the letters can be bought (owner's
 * call): once bought, or with too few hidden letters left, it's gone.
 */
export function LetterShopPill({ canAfford, onBuy, compact }: {
  canAfford: boolean;
  onBuy: () => void;
  compact?: boolean;
}) {
  const [refused, refuse] = useRefusal();
  const params = { count: LETTER_BUY_COUNT, cost: LETTER_BUY_COST };
  return (
    <Raised
      shadowColor={colors.shadow}
      radius={16}
      outerStyle={{ marginBottom: compact ? 7 : 10 }}
      style={[styles.pill, compact && { height: 36 }]}
    >
      <Text style={[styles.pillChip, styles.shopChip]}>{t('letters.label')}</Text>
      <Text style={[styles.pillText, refused && { color: colors.coralD }]} numberOfLines={1}>
        {refused ? t('tokens.notEnough') : t('letters.offer', params)}
      </Text>
      <PayButton
        label={t('letters.buy', params)}
        a11yLabel={t('letters.a11y.buy', params)}
        canAfford={canAfford}
        onPay={onBuy}
        onRefuse={refuse}
        pillHeight={compact ? 25 : 28}
      />
    </Raised>
  );
}

// ---- description ----

interface DescriptionProps {
  text: string;
  unlocked: boolean;
  /** Omitted once the round is over. Revealing the clue is always free. */
  onReveal?: () => void;
  compact?: boolean;
}

export function DescriptionCard({ text, unlocked, onReveal, compact }: DescriptionProps) {
  return (
    <Raised shadowColor={colors.shadow} radius={22} style={[styles.desc, compact && { paddingVertical: 7 }]}>
      <View style={styles.bulb}>
        <Icon xml={bulbXml} size={24} />
      </View>
      <View style={styles.descBody}>
        <Text style={styles.chip}>{t('description.label')}</Text>
        {unlocked ? (
          // Dictionary definitions are up to 140 characters (scripts/check-words.js): 4 lines on a 375 pt phone
          <Text style={styles.descText} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.85}>
            {text}
          </Text>
        ) : (
          // Keep the actual definition out of the view and accessibility tree until requested.
          <Text style={styles.descPrompt}>{t('description.hidden')}</Text>
        )}
      </View>
      {!unlocked && onReveal && (
        <Pressable onPress={onReveal} accessibilityRole="button" accessibilityLabel={t('description.a11y.show')}>
          {({ pressed }) => (
            <Raised pressed={pressed} shadowColor={colors.skyT} radius={14} style={styles.revealButton}>
              <Icon xml={eyeXml()} size={16} />
              <Text style={styles.revealText}>{t('description.show')}</Text>
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

  pill: {
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
  pillChip: {
    fontFamily: fonts.display600,
    fontSize: 12,
    letterSpacing: 1,
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: { flex: 1, fontFamily: fonts.body800, fontSize: 14, color: colors.muted },
  shopChip: { color: colors.butterT, backgroundColor: colors.butterL },

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
  descPrompt: { fontFamily: fonts.body800, fontSize: 14, color: colors.muted, marginTop: 3 },
  revealButton: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.sky },
  revealText: { fontFamily: fonts.display600, fontSize: 15, color: '#fff' },
  btn: { height: 56, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line },
  btnText: { fontFamily: fonts.display600, fontSize: 20, color: '#fff', letterSpacing: 0.2 },
});
