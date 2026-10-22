/*
 * The Characters page's pieces (mockup: Characters): the showcase stage with
 * the character being looked at, its name line, and the grid of every
 * character with its price or "Owned" / "Playing". Prices and ownership are
 * game rules (progress.ts); these only draw them.
 */
import { useIsFocused } from 'expo-router';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, Path, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';

import { bodyXml, Character, CHARACTERS } from '../characters/rig';
import { characterPrice } from '../game/progress';
import { t, TranslationKey } from '../i18n';
import { characterTint, colors, confettiColors, fonts } from '../theme';
import { checkXml, chevXml, coinXml, Icon, lockXml, sparkXml } from './icons';
import { Confetti } from './Confetti';
import { popFrom } from './motion';
import { Raised } from './Raised';

/** Every character for sale, cheapest first (free ones lead). */
export const SHOP: readonly Character[] = CHARACTERS.filter((c) => characterPrice(c.id) !== null).sort(
  (a, b) => characterPrice(a.id)! - characterPrice(b.id)!,
);

/** The species in the UI language; the rig's English one if a translation is missing. */
export function speciesOf(c: Character) {
  const key = `species.${c.id}` as TranslationKey;
  const text = t(key);
  return text === key ? c.species : text;
}

/** The rig's whole-character box (rig.js VIEWBOX: 220 × 260). */
const FIG_RATIO = 220 / 260;

// ---- the showcase stage ----

/** Sunburst stripes: one 10° wedge every 20°, around the centre of a 200 × 200 box. */
const RAYS = Array.from({ length: 18 }, (_, i) => {
  const a = (i * 20 * Math.PI) / 180;
  const b = ((i * 20 + 10) * Math.PI) / 180;
  const p = (r: number, x: number) => `${(100 + r * Math.cos(x)).toFixed(1)},${(100 + r * Math.sin(x)).toFixed(1)}`;
  return `M100,100 L${p(100, a)} L${p(100, b)} Z`;
}).join(' ');
const RAYS_MS = 40_000;
const HOP_MS = 520;
const PARTY_MS = 1700;

/** `cheer` changes when the player picks (`big` false) or buys (`big` true) a character: the stage celebrates. */
export type Cheer = { n: number; big: boolean };

interface ShowcaseProps {
  character: Character;
  cheer: Cheer;
  onPrev: () => void;
  onNext: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Showcase({ character, cheer, onPrev, onNext, style }: ShowcaseProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
  };
  const focused = useIsFocused();
  const [fx] = useState(() => ({
    spin: new Animated.Value(0),
    hop: new Animated.Value(0),
    pop: new Animated.Value(1),
    party: new Animated.Value(0),
    ribbon: new Animated.Value(0),
  }));

  // The rays turn and the character hops only while the page is in view.
  useEffect(() => {
    if (!focused) return;
    const native = { useNativeDriver: true };
    const loops = [
      Animated.loop(Animated.timing(fx.spin, { toValue: 1, duration: RAYS_MS, easing: Easing.linear, ...native })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(fx.hop, { toValue: 1, duration: HOP_MS, easing: Easing.out(Easing.quad), ...native }),
          Animated.timing(fx.hop, { toValue: 0, duration: HOP_MS, easing: Easing.in(Easing.quad), ...native }),
          Animated.delay(260),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [focused, fx]);

  // A new character on the stage pops in; a pick or a purchase pops harder, and a purchase throws a party.
  const shownId = useRef(character.id);
  useEffect(() => {
    if (character.id === shownId.current) return;
    shownId.current = character.id;
    popFrom(fx.pop, 0.82);
  }, [character.id, fx]);
  const cheered = useRef(cheer.n);
  useEffect(() => {
    if (cheer.n === cheered.current) return;
    cheered.current = cheer.n;
    popFrom(fx.pop, cheer.big ? 0.5 : 0.7);
    if (!cheer.big) return;
    const native = { useNativeDriver: true };
    fx.party.setValue(0);
    Animated.timing(fx.party, { toValue: 1, duration: PARTY_MS, easing: Easing.linear, ...native }).start();
    fx.ribbon.setValue(0);
    Animated.sequence([
      Animated.spring(fx.ribbon, { toValue: 1, friction: 5, tension: 140, ...native }),
      Animated.delay(1600),
      Animated.timing(fx.ribbon, { toValue: 0, duration: 260, ...native }),
    ]).start();
  }, [cheer, fx]);

  const xml = useMemo(() => bodyXml(character, { pose: 'cheer', expr: 'joy' }), [character]);
  const poppers = useMemo(
    () =>
      size && [
        { seed: 11, width: size.w, height: size.h, origin: { x: 0, y: size.h * 0.9 }, aim: -Math.PI / 2 + 0.5 },
        { seed: 29, width: size.w, height: size.h, origin: { x: size.w, y: size.h * 0.9 }, aim: -Math.PI / 2 - 0.5 },
      ],
    [size],
  );

  const figH = size ? size.h - 16 : 0;
  const rays = size ? Math.hypot(size.w, size.h) * 1.1 : 0;
  return (
    <Raised shadowColor={colors.shadow} radius={30} outerStyle={style} style={styles.stage}>
      <View style={StyleSheet.absoluteFill} onLayout={onLayout} accessible accessibilityRole="image"
        accessibilityLabel={t('chars.a11y.stage', { name: character.name, species: speciesOf(character) })}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="42%" r="70%">
              <Stop offset="0" stopColor="#fff" />
              <Stop offset="0.45" stopColor="#fff3e6" />
              <Stop offset="1" stopColor="#ffe7d2" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glow)" />
        </Svg>
        {size && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: rays,
              height: rays,
              left: size.w / 2 - rays / 2,
              top: size.h * 0.52 - rays / 2,
              transform: [{ rotate: fx.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }}
          >
            <Svg width="100%" height="100%" viewBox="0 0 200 200">
              <Path d={RAYS} fill="rgba(255,214,103,0.22)" />
            </Svg>
          </Animated.View>
        )}
        <View style={styles.rug} pointerEvents="none">
          <Svg width={190} height={34} viewBox="0 0 190 34">
            <Ellipse cx={95} cy={17} rx={95} ry={17} fill="#ffbf9c" />
            <Ellipse cx={95} cy={14.5} rx={95} ry={14.5} fill="#ffd2b8" />
          </Svg>
        </View>
        <View style={[styles.spark, { left: '21%', top: '15%' }]} pointerEvents="none">
          <Icon xml={sparkXml()} size={20} />
        </View>
        <View style={[styles.spark, { right: '21%', top: '27%' }]} pointerEvents="none">
          <Icon xml={sparkXml('#ff9fbf')} size={14} />
        </View>
        {size && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.figure,
              {
                transform: [
                  { translateY: fx.hop.interpolate({ inputRange: [0, 1], outputRange: [0, -figH * 0.06] }) },
                  { scale: fx.pop },
                ],
              },
            ]}
          >
            <SvgXml xml={xml} width={figH * FIG_RATIO} height={figH} />
          </Animated.View>
        )}
        <Animated.View
          pointerEvents="none"
          style={[styles.ribbon, { opacity: fx.ribbon, transform: [{ scale: fx.ribbon.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
        >
          <Text style={styles.ribbonText}>{t('chars.welcome', { name: character.name })}</Text>
        </Animated.View>
        {poppers && poppers.map((p) => <Confetti key={p.seed} fire={fx.party} colors={confettiColors} {...p} />)}
      </View>
      <Arrow dir="l" onPress={onPrev} />
      <Arrow dir="r" onPress={onNext} />
    </Raised>
  );
}

function Arrow({ dir, onPress }: { dir: 'l' | 'r'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.arrow, dir === 'l' ? { left: 10 } : { right: 10 }]}
      accessibilityRole="button"
      accessibilityLabel={t(dir === 'l' ? 'chars.a11y.prev' : 'chars.a11y.next')}
    >
      {({ pressed }) => (
        <Raised depth={3} shadowColor={colors.shadow} radius={21} pressed={pressed} style={styles.arrowFace}>
          <Icon xml={chevXml(dir)} size={20} />
        </Raised>
      )}
    </Pressable>
  );
}

// ---- name line ----

export type Ownership = 'locked' | 'owned' | 'playing';

/** Name, species and status; a locked one adds its price tag. `note` replaces the species line (e.g. a refusal). */
export function CharacterInfo({ character, ownership, price, note }: {
  character: Character;
  ownership: Ownership;
  price: number;
  note?: string | null;
}) {
  const species = speciesOf(character);
  return (
    <View style={styles.info}>
      <View style={styles.infoText}>
        <Text style={styles.name} numberOfLines={1}>{character.name}</Text>
        <Text style={[styles.species, note ? styles.note : null]} numberOfLines={1}>
          {note ?? t(`chars.${ownership}`, { species })}
        </Text>
      </View>
      {ownership === 'locked' && (
        <View style={styles.tag}>
          <Icon xml={lockXml('#d9a530')} size={15} />
          <Text style={styles.tagText}>{price}</Text>
          <Icon xml={coinXml} size={18} />
        </View>
      )}
    </View>
  );
}

// ---- the grid ----

const COLUMNS = 5;
const GAP = 7;

interface CardProps {
  character: Character;
  ownership: Ownership;
  viewed: boolean;
  width: number;
  height: number;
  onPress: (id: string) => void;
}

const Card = memo(function Card({ character, ownership, viewed, width, height, onPress }: CardProps) {
  const locked = ownership === 'locked';
  const price = characterPrice(character.id)!;
  const xml = useMemo(() => bodyXml(character), [character]);
  // What's left once the name and the price lines are in
  const figH = height - 46;
  return (
    <Pressable
      onPress={() => onPress(character.id)}
      accessibilityRole="button"
      accessibilityState={{ selected: viewed }}
      accessibilityLabel={t(`chars.a11y.card.${ownership}`, { name: character.name, price })}
    >
      <Raised
        depth={3}
        shadowColor={viewed ? colors.coralD : colors.shadow}
        radius={19}
        style={[
          styles.card,
          { width, height, backgroundColor: characterTint[character.id] ?? colors.paper },
          viewed && styles.cardViewed,
        ]}
      >
        <View style={locked && styles.faded}>
          <SvgXml xml={xml} width={figH * FIG_RATIO} height={figH} />
        </View>
        <Text style={styles.cardName} numberOfLines={1}>{character.name}</Text>
        {locked ? (
          <View style={styles.price}>
            <Icon xml={coinXml} size={14} />
            <Text style={styles.priceText}>{price}</Text>
          </View>
        ) : (
          <Text style={styles.owned}>{t(ownership === 'playing' ? 'chars.card.playing' : 'chars.card.owned')}</Text>
        )}
        {locked && (
          <View style={styles.lock}>
            <Icon xml={lockXml()} size={13} />
          </View>
        )}
      </Raised>
      {ownership === 'playing' && (
        <View style={styles.check}>
          <Icon xml={checkXml} size={13} />
        </View>
      )}
    </Pressable>
  );
});

export function CharacterGrid({ ownership, viewedId, width, compact, onPress }: {
  ownership: (id: string) => Ownership;
  viewedId: string;
  /** The grid's width: the cards share it. */
  width: number;
  compact: boolean;
  onPress: (id: string) => void;
}) {
  const cardW = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);
  const cardH = compact ? 96 : 116;
  return (
    <View style={styles.grid}>
      {SHOP.map((c) => (
        <Card
          key={c.id}
          character={c}
          ownership={ownership(c.id)}
          viewed={c.id === viewedId}
          width={cardW}
          height={cardH}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, borderWidth: 3, borderColor: '#fff', borderRadius: 30 },
  rug: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  spark: { position: 'absolute' },
  figure: { position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' },
  ribbon: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: colors.butterL,
    borderColor: '#ffe39a',
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  ribbonText: { fontFamily: fonts.display600, fontSize: 16, color: colors.butterT },
  arrow: { position: 'absolute', top: '50%', marginTop: -24 },
  arrowFace: { width: 42, height: 42, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, marginBottom: 10, marginHorizontal: 4 },
  infoText: { flexShrink: 1 },
  name: { fontFamily: fonts.display700, fontSize: 26, lineHeight: 30, color: colors.ink },
  species: { fontFamily: fonts.display500, fontSize: 14, color: colors.muted, marginTop: 1 },
  note: { color: colors.coralD },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.butterL,
    borderColor: '#ffe39a',
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 5,
    paddingLeft: 7,
    paddingRight: 9,
  },
  tagText: { fontFamily: fonts.display600, fontSize: 15, color: colors.butterT },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: { borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
  cardViewed: { borderWidth: 3, borderColor: colors.coral },
  faded: { opacity: 0.5 },
  cardName: { fontFamily: fonts.display600, fontSize: 13, color: colors.ink },
  price: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
  priceText: { fontFamily: fonts.display700, fontSize: 12.5, color: colors.butterT },
  owned: { fontFamily: fonts.display600, fontSize: 11.5, color: colors.mintT, marginTop: 1 },
  lock: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.mint,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
