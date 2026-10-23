/*
 * Words guessed in a row (owner's idea, not in the mockup): when a win makes a
 * streak of STREAK_SHOWN_FROM or more, the Play screen's body turns into a
 * celebration before the result. A meter of cells, one per word, fills toward
 * the next streak bonus (progress.streakMeter), in that stretch's own colours
 * (theme.streakColors). This win's cell fills and its star pops.
 *
 * When the win fills the meter, the bonus moment plays: the goal star on top
 * lights, the card flashes, the meter pulses, confetti bursts and the bonus is
 * announced. The reward flies from the count into the token counter. The
 * takeover closes by itself (or on a tap), then the result shows.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, SvgXml } from 'react-native-svg';

import { bodyXml, Character } from '../characters/rig';
import { feedback } from '../feedback';
import { useSoundScope } from '../audio/AudioProvider';
import { STREAK_BONUS_AT } from '../game/config';
import { StreakMeter, streakMeter } from '../game/progress';
import { useTranslation } from '../i18n';
import { colors, confettiColors, fonts, streakColor } from '../theme';
import { Confetti } from './Confetti';
import { coinXml, Icon, sparkXml, starXml } from './icons';
import { popFrom } from './motion';
import { Raised } from './Raised';
import { SparkBurst } from './SparkBurst';
import { useTokenOrigin } from './TokenFlight';

/** A streak this long or longer gets the takeover; a single win isn't a streak yet. */
export const STREAK_SHOWN_FROM = 2;

const SHOW_MS = 280;
/** Card shown → this win's cell starts filling. */
const FILL_DELAY_MS = 380;
const FILL_MS = 620;
/** Cell filled → the bonus moment, when the meter is full. */
const BOOM_DELAY_MS = 260;
const BOOM_MS = 950;
const CONFETTI_MS = 2100;
/** How long the end lingers before the takeover closes by itself. */
const HOLD_MS = { plain: 1150, full: 2000 };
/** The closing dissolve: the result is already underneath, its stamp landing as the card fades. */
const HIDE_MS = 260;
/** Taps meant for the last key can't skip the takeover as it appears. */
const TAP_AFTER_MS = 450;

const CELL_GAP = 6;
const RAYS = 14;
const RAY_R = 560;
const RAY_D = (() => {
  const step = Math.PI / RAYS;
  return Array.from({ length: RAYS }, (_, i) => {
    const a = i * 2 * step;
    const p = (b: number) => `${(RAY_R * Math.cos(b)).toFixed(1)} ${(RAY_R * Math.sin(b)).toFixed(1)}`;
    return `M0 0L${p(a)}L${p(a + step)}Z`;
  }).join('');
})();
const STAR_D = 'M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z';
const WHITE_STAR = starXml('#fff');
/** Twinkling sparks, as fractions of the card. */
const TWINKLES = [
  { x: 0.1, y: 0.2, size: 16 },
  { x: 0.86, y: 0.16, size: 20 },
  { x: 0.92, y: 0.5, size: 14 },
  { x: 0.08, y: 0.55, size: 12 },
  { x: 0.78, y: 0.78, size: 16 },
  { x: 0.22, y: 0.38, size: 10 },
];

type Phase = 'filling' | 'landed' | 'boom';
type CellState = 'done' | 'next' | 'empty';
type Look = ReturnType<typeof streakColor>;

function createFx() {
  const v = (n: number) => new Animated.Value(n);
  return { show: v(0), hide: v(0), fill: v(0), cell: v(0), cellBurst: v(1), count: v(1), title: v(1), note: v(0), boom: v(0), star: v(0), starBurst: v(1), confetti: v(0), spin: v(0), hop: v(0), twinkle: v(0) };
}
type Fx = ReturnType<typeof createFx>;

const timing = (value: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.quad)) =>
  Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

/** The takeover's sky, its slowly turning sunburst and its twinkling sparks. */
const Backdrop = memo(function Backdrop({ look, tier, fx, size }: { look: Look; tier: number; fx: Fx; size: { w: number; h: number } }) {
  const id = `streakSky${tier}`;
  const rotate = fx.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={look.bg[0]} />
            <Stop offset="1" stopColor={look.bg[1]} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[styles.rays, { left: size.w / 2 - RAY_R, top: size.h * 0.52 - RAY_R, transform: [{ rotate }] }]}
      >
        <Svg width={RAY_R * 2} height={RAY_R * 2} viewBox={`${-RAY_R} ${-RAY_R} ${RAY_R * 2} ${RAY_R * 2}`}>
          <Path d={RAY_D} fill="#fff" fillOpacity={look.ray} />
        </Svg>
      </Animated.View>
      {TWINKLES.map((s, i) => {
        // Each spark pulses once per loop, at its own moment
        const phase = Animated.modulo(Animated.add(fx.twinkle, i / TWINKLES.length), 1);
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: s.x * size.w - s.size / 2,
              top: s.y * size.h - s.size / 2,
              opacity: phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 1, 0.25] }),
              transform: [{ scale: phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.15, 0.6] }) }],
            }}
          >
            <Icon xml={sparkXml('#fff')} size={s.size} />
          </Animated.View>
        );
      })}
    </>
  );
});

/** The player's character cheering beside the meter, hopping on the spot. */
const Cheering = memo(function Cheering({ character, height, hop }: { character: Character; height: number; hop: Animated.Value }) {
  const xml = useMemo(() => bodyXml(character, { pose: 'cheer', expr: 'joy' }), [character]);
  const width = (height * 220) / 260;
  return (
    <View style={{ width, height: height + 6, justifyContent: 'flex-end', alignItems: 'center' }}>
      <Animated.View
        style={[
          styles.shadow,
          { width: width * 0.62, transform: [{ scale: hop.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }] },
        ]}
      />
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          transform: [
            { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.13] }) },
            { rotate: hop.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '4deg'] }) },
          ],
        }}
      >
        <SvgXml xml={xml} width={width} height={height} />
      </Animated.View>
    </View>
  );
});

/** One cell of the meter: a word of the streak. `next` is this win's cell, filling up from the bottom. */
function Cell({ look, state, fx, w, h }: { look: Look; state: CellState; fx: Fx; w: number; h: number }) {
  const star = w * 0.42;
  const filled = [styles.cellFill, { backgroundColor: look.main, borderBottomColor: look.dark }];
  return (
    <View style={[styles.cell, { width: w, height: h }, state === 'next' && styles.cellNext]}>
      {state === 'done' && (
        <View style={filled}>
          <Icon xml={WHITE_STAR} size={star} />
        </View>
      )}
      {state === 'next' && (
        <>
          <Animated.View style={[filled, { transformOrigin: 'bottom', transform: [{ scaleY: fx.fill }] }]} />
          <Animated.View style={[styles.cellStar, { transform: [{ scale: fx.cell }] }]}>
            <Icon xml={WHITE_STAR} size={star} />
            <SparkBurst burst={fx.cellBurst} reach={w * 0.75} size={14} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

/** Sizes for a stage `h` tall holding `cells` cells: the meter and the character grow to fill it. */
function stageSizes(h: number, cells: number) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const goal = clamp(h * 0.17, 46, 78);
  // The tube's padding, border and raised bottom, plus the gaps between cells
  const chrome = 12 + 3 + 8 + (cells - 1) * CELL_GAP;
  const cellH = clamp((h - 16 - goal * 0.7 - chrome) / cells, 30, 74);
  return { goal, cellH, cellW: clamp(cellH * 1.4, 56, 96), charH: clamp(h * 0.52, 92, 220) };
}
type Sizes = ReturnType<typeof stageSizes>;

/** The meter: a tube of cells from `from` to `to`, with the goal star on top that lights when it's full. */
function Meter({ meter, streak, look, fx, sizes }: { meter: StreakMeter; streak: number; look: Look; fx: Fx; sizes: Sizes }) {
  const { cellW, cellH, goal } = sizes;
  const next = streak - 1 - meter.from;
  const cells = Array.from({ length: meter.to - meter.from }, (_, i): CellState => (i < next ? 'done' : i === next ? 'next' : 'empty'));
  const pulse = fx.boom.interpolate({ inputRange: [0, 0.18, 0.45, 1], outputRange: [1, 1.12, 0.97, 1] });
  return (
    <Animated.View style={{ alignItems: 'center', transform: [{ scale: pulse }] }}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            opacity: fx.boom.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.75, 0] }),
            transform: [{ scale: fx.boom.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.9] }) }],
          },
        ]}
      />
      <View style={[styles.goal, { width: goal, height: goal, marginBottom: -goal * 0.3 }]}>
        <Svg width={goal} height={goal} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
          <Path d={STAR_D} fill={look.light} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ scale: fx.star }, { rotate: fx.boom.interpolate({ inputRange: [0, 1], outputRange: ['-40deg', '0deg'] }) }] },
          ]}
        >
          <Svg width={goal} height={goal} viewBox="0 0 24 24">
            <Path d={STAR_D} fill={colors.butter} stroke={colors.butterD} strokeWidth={1.6} strokeLinejoin="round" />
          </Svg>
        </Animated.View>
        <SparkBurst burst={fx.starBurst} reach={goal * 1.5} size={22} />
      </View>
      {/* Not Raised: its clipping would cut off the new cell's sparks */}
      <View style={[styles.tube, { borderRadius: (cellW + 18) / 2, borderBottomColor: look.dark }]}>
        {cells.map((state, i) => (
          <Cell key={i} look={look} state={state} fx={fx} w={cellW} h={cellH} />
        ))}
      </View>
    </Animated.View>
  );
}

interface Props {
  /** The streak this win made (≥ STREAK_SHOWN_FROM). */
  streak: number;
  /** Tokens the win paid: they fly from the count into the counter. */
  tokens: number;
  character: Character;
  compact: boolean;
  /** As the takeover starts fading out: the Play screen puts the result underneath. */
  onReveal: () => void;
  /** Faded out: the Play screen unmounts it. */
  onDone: () => void;
}

export function StreakTakeover({ streak, tokens, character, compact, onReveal, onDone }: Props) {
  const t = useTranslation();
  const audio = useSoundScope();
  const meter = streakMeter(streak);
  const maxed = meter.tier >= STREAK_BONUS_AT.length;
  const look = streakColor(meter.tier);
  const [fx] = useState(createFx);
  const [phase, setPhase] = useState<Phase>('filling');
  const [tappable, setTappable] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [stageH, setStageH] = useState(0);
  const [countRef, sendToken] = useTokenOrigin();
  const sent = useRef(false);
  const closing = useRef(false);

  const sendReward = useCallback(() => {
    if (sent.current || tokens <= 0) return;
    sent.current = true;
    sendToken(1);
  }, [tokens, sendToken]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    audio.cancel();
    sendReward();
    onReveal();
    timing(fx.hide, 1, HIDE_MS, Easing.in(Easing.quad)).start(() => onDone());
  }, [fx, sendReward, onReveal, onDone, audio]);

  // Appear, keep the backdrop alive, fill this win's cell
  useEffect(() => {
    const cancelAudio = audio.sequence([{ cue: 'streak-open' }, { cue: 'streak-fill', at: SHOW_MS + FILL_DELAY_MS }]);
    const loops = [
      Animated.loop(timing(fx.spin, 1, 26000, Easing.linear)),
      Animated.loop(timing(fx.twinkle, 1, 2400, Easing.linear)),
      Animated.loop(
        Animated.sequence([
          timing(fx.hop, 1, 260, Easing.out(Easing.quad)),
          timing(fx.hop, 0, 260, Easing.in(Easing.quad)),
          Animated.delay(160),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    const run = Animated.sequence([
      timing(fx.show, 1, SHOW_MS, Easing.out(Easing.cubic)),
      Animated.delay(FILL_DELAY_MS),
      timing(fx.fill, 1, FILL_MS, Easing.out(Easing.cubic)),
    ]);
    run.start(({ finished }) => finished && setPhase('landed'));
    const tap = setTimeout(() => setTappable(true), TAP_AFTER_MS);
    return () => {
      loops.forEach((l) => l.stop());
      run.stop();
      clearTimeout(tap);
      cancelAudio();
    };
  }, [fx, audio]);

  // The cell is full: its star pops, the count ticks up, the reward flies
  useEffect(() => {
    if (phase !== 'landed') return;
    if (!closing.current) audio.play('star-land');
    feedback.streak();
    popFrom(fx.cell, 0);
    popFrom(fx.count, 1.6);
    fx.cellBurst.setValue(0);
    timing(fx.cellBurst, 1, 650).start();
    sendReward();
    if (!meter.full) Animated.spring(fx.note, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    const id = setTimeout(() => (meter.full ? setPhase('boom') : close()), meter.full ? BOOM_DELAY_MS : HOLD_MS.plain);
    return () => clearTimeout(id);
  }, [phase, fx, meter.full, sendReward, close, audio]);

  // The meter is full: the bonus moment
  useEffect(() => {
    if (phase !== 'boom') return;
    if (!closing.current) {
      audio.play('streak-bonus');
      audio.play('confetti', .8);
    }
    feedback.streakBonus();
    popFrom(fx.star, 0);
    popFrom(fx.title, 0.5);
    fx.starBurst.setValue(0);
    Animated.parallel([
      timing(fx.boom, 1, BOOM_MS, Easing.out(Easing.cubic)),
      timing(fx.starBurst, 1, 800),
      timing(fx.confetti, 1, CONFETTI_MS, Easing.linear),
      Animated.spring(fx.note, { toValue: 1, friction: 5, tension: 120, delay: 250, useNativeDriver: true }),
    ]).start();
    const id = setTimeout(close, HOLD_MS.full);
    return () => clearTimeout(id);
  }, [phase, fx, close, audio]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };
  // Two party poppers, from the bottom corners toward the middle
  const poppers = useMemo(
    () =>
      size && [
        { seed: 11, width: size.w, height: size.h, origin: { x: 0, y: size.h * 0.9 }, aim: -Math.PI / 2 + 0.5 },
        { seed: 29, width: size.w, height: size.h, origin: { x: size.w, y: size.h * 0.9 }, aim: -Math.PI / 2 - 0.5 },
      ],
    [size],
  );

  const boomed = phase === 'boom';
  const title = boomed ? t(maxed ? 'streak.title.max' : 'streak.title.bonus') : t('streak.title');
  const left = meter.to - streak;
  const note = maxed
    ? t('streak.max', { bonus: meter.bonus })
    : meter.full
      ? t(meter.bonus === 1 ? 'streak.bonus.one' : 'streak.bonus.other', { bonus: meter.bonus })
      : t(left === 1 ? 'streak.next.one' : 'streak.next.other', { count: left, bonus: meter.bonus + 1 });
  const bonusNote = maxed || meter.full;
  const sizes = stageH > 0 ? stageSizes(stageH, meter.to - meter.from) : null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          // Grows in as it appears, and keeps growing a little as it dissolves (never shrinks onto a gap)
          opacity: Animated.multiply(fx.show, fx.hide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
          transform: [
            { scale: fx.show.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            { scale: fx.hide.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
          ],
        },
      ]}
      accessibilityViewIsModal
    >
      <Pressable
        style={styles.press}
        onPress={() => { close(); audio.play('panel-close'); }}
        disabled={!tappable}
        accessibilityRole="button"
        accessibilityLabel={t('streak.a11y', { count: streak, note })}
      >
        <Raised depth={6} shadowColor={look.dark} radius={28} outerStyle={styles.press} style={styles.card}>
          <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
            {size && <Backdrop look={look} tier={meter.tier} fx={fx} size={size} />}
          </View>

          <Animated.View style={[styles.signWrap, { transform: [{ scale: fx.title }] }]}>
            <Raised depth={5} shadowColor={look.dark} radius={24} style={styles.sign}>
              <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
              <View ref={countRef} collapsable={false} style={styles.countRow}>
                <Animated.Text style={[styles.count, { color: look.main, transform: [{ scale: fx.count }] }, compact && styles.countCompact]}>
                  {phase === 'filling' ? streak - 1 : streak}
                </Animated.Text>
                <Text style={styles.inARow}>{t('streak.inARow')}</Text>
              </View>
            </Raised>
          </Animated.View>

          <View style={styles.stage} onLayout={(e) => setStageH(e.nativeEvent.layout.height)}>
            {sizes && (
              <View style={styles.stageRow}>
                <Cheering character={character} height={sizes.charH} hop={fx.hop} />
                <Meter meter={meter} streak={streak} look={look} fx={fx} sizes={sizes} />
              </View>
            )}
          </View>

          <Animated.View
            style={[
              styles.note,
              bonusNote ? styles.noteBonus : styles.notePlain,
              {
                opacity: fx.note,
                transform: [
                  { translateY: fx.note.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
                  { scale: fx.note.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                ],
              },
            ]}
          >
            {bonusNote && <Icon xml={coinXml} size={20} />}
            <Text style={[styles.noteText, { color: bonusNote ? colors.butterT : colors.ink }]}>{note}</Text>
          </Animated.View>
          <Text style={[styles.tap, { color: look.hint }]}>{t('streak.tap')}</Text>

          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: fx.boom.interpolate({ inputRange: [0, 0.08, 0.45, 1], outputRange: [0, 0.6, 0, 0] }) }]} />
          {poppers && meter.full &&
            poppers.map((p) => <Confetti key={p.seed} fire={fx.confetti} colors={confettiColors} {...p} />)}
        </Raised>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Over the Play screen's body: it fades in over the round and out over the result. The header
  // stays, so the reward can fly into it. zIndex above the result stamp's 2: iOS turns zIndex
  // into a layer depth that ignores stacking order (see LevelChange)
  wrap: { position: 'absolute', left: 16, right: 16, top: 4, bottom: 0, zIndex: 10 },
  press: { flex: 1 },
  card: { flex: 1, borderWidth: 3, borderColor: '#fff', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  rays: { position: 'absolute', width: RAY_R * 2, height: RAY_R * 2 },
  signWrap: { alignSelf: 'stretch', alignItems: 'center' },
  sign: { backgroundColor: '#fff', alignItems: 'center', paddingHorizontal: 22, paddingTop: 6, paddingBottom: 4 },
  title: { fontFamily: fonts.display700, fontSize: 32, color: colors.ink },
  titleCompact: { fontSize: 26 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: -4 },
  count: { fontFamily: fonts.display700, fontSize: 44 },
  countCompact: { fontSize: 36 },
  inARow: { fontFamily: fonts.display600, fontSize: 19, color: colors.muted },
  stage: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', minHeight: 0 },
  stageRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 16 },
  shadow: { height: 12, borderRadius: 6, backgroundColor: 'rgba(75,58,53,0.14)' },
  halo: { position: 'absolute', top: '25%', width: 220, height: 220, borderRadius: 110, backgroundColor: '#fff' },
  goal: { zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  tube: { backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 3, borderBottomWidth: 8, borderColor: '#fff', padding: 6, gap: CELL_GAP, flexDirection: 'column-reverse' },
  cell: { borderRadius: 14, backgroundColor: colors.track },
  // Drawn over the cells above it, so its sparks aren't hidden
  cellNext: { zIndex: 1 },
  cellFill: { ...StyleSheet.absoluteFill, borderRadius: 14, borderBottomWidth: 4, alignItems: 'center', justifyContent: 'center' },
  cellStar: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
  noteBonus: { backgroundColor: colors.butterL, borderColor: '#ffe39a' },
  notePlain: { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: '#fff' },
  noteText: { fontFamily: fonts.display600, fontSize: 15 },
  tap: { marginTop: 8, fontFamily: fonts.body800, fontSize: 13, opacity: 0.85 },
  flash: { backgroundColor: '#fff' },
});
