/*
 * The pieces between the scene and the keyboard: miss pips, word tiles,
 * the letter shop pill and the description card (the shop's pay
 * buttons: PayButton.tsx). Sizes and colours follow
 * design/ui-mockup.html (.misses, .tiles, .desc).
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { LETTER_BUY_COST, LETTER_BUY_COUNT } from '../game/config';
import { displayLetter } from '../game/languages';
import { TranslationKey, useTranslation } from '../i18n';
import { colors, fonts } from '../theme';
import { useLayout } from '../theme/layout';
import { bulbXml, Icon, sparkXml } from './icons';
import { popFrom } from './motion';
import { PayButton, useRefusal } from './PayButton';
import { Raised } from './Raised';
import { sound, Cue } from '../audio';

// ---- misses ----

const PIP_H = 11;

export function MissesBar({ wrong, max }: { wrong: number; max: number }) {
  const t = useTranslation();
  const { tight, scale, type } = useLayout();
  const pip = Math.round(PIP_H * scale);
  return (
    <View style={[styles.misses, tight && styles.missesTight]}>
      <View style={styles.pips}>
        {Array.from({ length: max }, (_, i) => (
          <View key={i} style={[styles.pip, { height: pip, borderRadius: pip / 2 }, i < wrong && styles.pipOn]} />
        ))}
      </View>
      <Text style={[styles.missText, { fontSize: Math.round(14 * type) }]}>
        <Text style={styles.missCount}>{wrong}</Text> {t('play.misses', { max })}
      </Text>
    </View>
  );
}

// ---- tiles ----

/** The widest a tile gets on a phone (the mockup's); a tablet's grow with the layout's scale. */
const TILE_W = 50;

export type TileLook = 'hidden' | 'clue' | 'ok' | 'miss';

const TILE_LOOK = {
  ok: { bg: colors.mintL, border: '#bdecd6', shadow: '#a5dfc4', text: colors.mintT },
  clue: { bg: colors.butterL, border: '#ffe39a', shadow: '#f2d27a', text: colors.butterT },
  miss: { bg: colors.coralL, border: '#ffcfc5', shadow: '#f6b8ab', text: colors.coralD },
};

export function Tile({ letter, look, w, h, sparkle = true }: { letter: string; look: TileLook; w: number; h: number; sparkle?: boolean }) {
  const t = useTranslation();
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
        <Text style={[styles.tileText, { fontSize: Math.round(w * 0.6), color: c.text }]}>{displayLetter(letter)}</Text>
      </Raised>
      {look === 'clue' && sparkle && (
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
export function WordTiles({ letters }: { letters: { letter: string; look: TileLook }[] }) {
  const { available, compact, tight, scale } = useLayout();
  const n = letters.length;
  const gap = Math.round((n > 10 ? 3 : n > 6 ? 6 : 8) * scale);
  const w = Math.floor(Math.min(TILE_W * scale, (available - gap * (n - 1)) / n));
  const h = Math.min(Math.round((tight ? 42 : compact ? 48 : 58) * scale), Math.round(w * 1.16));
  return (
    <View style={[styles.tiles, styles.tileRow, { gap, marginVertical: tight ? 7 : compact ? 9 : Math.round(13 * scale) }]}>
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
export function LetterShopPill({ canAfford, onBuy }: {
  canAfford: boolean;
  onBuy: () => void;
}) {
  const t = useTranslation();
  const { compact, type } = useLayout();
  const [refused, refuse] = useRefusal();
  const params = { count: LETTER_BUY_COUNT, cost: LETTER_BUY_COST };
  return (
    <Raised
      shadowColor={colors.shadow}
      radius={16}
      outerStyle={{ marginBottom: compact ? 7 : 10 }}
      style={[styles.pill, { height: compact ? 36 : Math.round(40 * type) }]}
    >
      <Text style={[styles.pillChip, styles.shopChip]}>{t('letters.label')}</Text>
      <Text style={[styles.pillText, { fontSize: Math.round(14 * type) }, refused && { color: colors.coralD }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
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

const subjectLabels: Record<string, TranslationKey> = {
  "animal": "subjects.animal",
  "food": "subjects.food",
  "plant": "subjects.plant",
  "object": "subjects.object",
  "person": "subjects.person",
  "place": "subjects.place",
  "body": "subjects.body",
  "material": "subjects.material",
  "nature": "subjects.nature",
  "action": "subjects.action",
  "feeling": "subjects.feeling",
  "describing": "subjects.describing",
  "time": "subjects.time",
  "quantity": "subjects.quantity",
  "communication": "subjects.communication",
  "idea": "subjects.idea",
  "group": "subjects.group",
  "event": "subjects.event",
  "language": "subjects.language",
  "quality": "subjects.quality",
  "state": "subjects.state",
  "mind": "subjects.mind",
  "money": "subjects.money",
  "amount": "subjects.amount",
  "shape": "subjects.shape",
  "relation": "subjects.relation",
  "movement": "subjects.movement",
  "senses": "subjects.senses",
  "competition": "subjects.competition",
  "manner": "subjects.manner"
};

interface DescriptionProps {
  text: string;
  subject?: string;
}

export function DescriptionCard({ text, subject }: DescriptionProps) {
  const t = useTranslation();
  const { compact, tight, type } = useLayout();
  const bulb = Math.round((tight ? 34 : 42) * type);
  // The whole description always shows (it's the clue): a very short phone sets it a little smaller
  const size = tight ? 13 : Math.round(14 * type);
  return (
    <Raised shadowColor={colors.shadow} radius={22} style={[styles.desc, compact && { paddingVertical: tight ? 6 : 7 }, tight && styles.descTight]}>
      <View style={[styles.bulb, { width: bulb, height: bulb, borderRadius: bulb / 3 }]}>
        <Icon xml={bulbXml} size={Math.round(bulb * 0.57)} />
      </View>
      <View style={styles.descBody}>
        <Text style={[styles.chip, { fontSize: Math.round(12 * type) }]}>{subject && Object.hasOwn(subjectLabels, subject) ? t(subjectLabels[subject]) : t('description.label')}</Text>
        {/* Dictionary definitions are up to 140 characters: 4 lines on a 375 pt phone. */}
        <Text style={[styles.descText, { fontSize: size, lineHeight: Math.round(size * 1.36) }]} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.85}>
          {text}
        </Text>
      </View>
    </Raised>
  );
}

// ---- big button ----

export function BigButton({ label, onPress, ghost, cue, disabled = false, muted, leading, trailing }: {
  label: string; onPress: () => void; ghost?: boolean; cue?: Cue | false; disabled?: boolean;
  muted?: boolean; leading?: ReactNode; trailing?: ReactNode;
}) {
  const { tight } = useLayout();
  return (
    <Pressable onPress={() => { sound.unlock(); if (cue !== false) sound.play(cue ?? (ghost ? 'tap' : 'primary')); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={disabled && styles.btnDisabled}>
      {({ pressed }) => (
        <Raised
          depth={5}
          pressed={pressed}
          shadowColor={muted ? '#dccdbc' : ghost ? colors.shadow : colors.coralD}
          radius={20}
          outerStyle={{ marginVertical: tight ? 5 : 8 }}
          style={[styles.btn, tight && styles.btnTight, ghost && styles.btnGhost, muted && styles.btnMuted]}
        >
          {leading}
          <Text style={[styles.btnText, ghost && { color: colors.coralD }, muted && { color: '#b9a595' }]}>{label}</Text>
          {trailing}
        </Raised>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  misses: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11, marginHorizontal: 4 },
  missesTight: { marginTop: 7 },
  pips: { flex: 1, flexDirection: 'row', gap: 4 },
  pip: { flex: 1, backgroundColor: colors.track },
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
  descTight: { minHeight: 56, gap: 9 },
  descBody: { flex: 1, minWidth: 0 },
  chip: { fontFamily: fonts.display600, fontSize: 12, letterSpacing: 1, color: colors.butterT },
  descText: { fontFamily: fonts.body800, fontSize: 14, color: colors.ink, marginTop: 1 },
  btn: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnTight: { minHeight: 50, paddingVertical: 8 },
  btnMuted: { backgroundColor: '#eadfd2' },
  btnDisabled: { opacity: 0.45 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line },
  btnText: { fontFamily: fonts.display600, fontSize: 20, color: '#fff', letterSpacing: 0.2, flexShrink: 1, textAlign: 'center' },
});
