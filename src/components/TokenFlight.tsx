/*
 * Token flights: the amount gained or spent pops out where it happened
 * (the "+N tokens" badge, the Unlock button…) and flies into the token
 * counter in the header, so the player sees exactly what moved. The counter
 * only changes its number when the flight lands.
 *
 * Two things meet here, in either order:
 *   - the origin: `useTokenOrigin()` gives a ref for the view and
 *     `send(+1 | -1)`, which measures it. A spend waits for `send` before
 *     dispatching, because its button may be gone after; a gain sends when
 *     its badge appears, after the reducer already paid.
 *   - the counter (TokenPill) noticing its balance changed, via `awaitOrigin`.
 * Whichever comes second starts the flight. An origin with no change to
 * carry expires (e.g. a result restored after a restart); a change with no
 * origin is counted in place by the pill after a moment.
 */
import { createContext, ReactNode, RefObject, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { colors, fonts } from '../theme';
import { coinXml, Icon } from './icons';

type Sign = 1 | -1;
type Point = { x: number; y: number };
interface Origin {
  sign: Sign;
  at: Point | null;
  time: number;
}
interface FlightData {
  id: number;
  from: Point;
  to: Point;
  delta: number;
  onDone: () => void;
}

/** An origin waits this long for its balance change (a spend dispatches right after sending). */
const ORIGIN_TTL = 800;
const APPEAR_MS = 240;
/** Gains linger a little at the origin so the player reads them; spends leave quickly. */
const HOLD_MS = { gain: 300, spend: 120 };
const FLY_MS = 620;
/** A measurement that hasn't answered by then counts as failed, so a spend never hangs on it. */
const MEASURE_TIMEOUT_MS = 300;
/** The chip's box, centred on the flight's point. */
const BOX = { w: 160, h: 40 };

const centerOf = (view: View | null) =>
  new Promise<Point | null>((resolve) => {
    if (!view) return resolve(null);
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    view.measureInWindow((x, y, w, h) => {
      clearTimeout(timer);
      resolve(w || h ? { x: x + w / 2, y: y + h / 2 } : null);
    });
  });

function createHub(setFlights: ((f: (all: FlightData[]) => FlightData[]) => void) | null) {
  let origin: Origin | null = null;
  let waiter: { sign: Sign; take: (o: Origin) => void } | null = null;
  let target: View | null = null;
  let nextId = 0;
  return {
    /** The counter's coin, where every flight lands. */
    setTarget: (view: View | null) => {
      target = view;
    },
    /** An origin says: the next balance change in this direction starts at `view`. Resolves once measured. */
    async send(view: View | null, sign: Sign) {
      const o = { sign, at: await centerOf(view), time: Date.now() };
      if (waiter?.sign === sign) {
        const { take } = waiter;
        waiter = null;
        take(o);
      } else origin = o;
    },
    /** The counter's balance changed: `take` gets the origin now or when it's sent. Returns a cancel. */
    awaitOrigin(sign: Sign, take: (o: Origin) => void) {
      if (origin?.sign === sign && Date.now() - origin.time < ORIGIN_TTL) {
        const o = origin;
        origin = null;
        take(o);
        return () => {};
      }
      waiter = { sign, take };
      return () => {
        if (waiter?.take === take) waiter = null;
      };
    },
    /** Fly `delta` from the origin to the counter; `onLand` runs on arrival (at once if it can't fly). */
    async fly(o: Origin, delta: number, onLand: () => void) {
      const from = o.at;
      const to = await centerOf(target);
      if (!setFlights || !from || !to) return onLand();
      const id = nextId++;
      const onDone = () => {
        setFlights((all) => all.filter((f) => f.id !== id));
        onLand();
      };
      setFlights((all) => [...all, { id, from, to, delta, onDone }]);
    },
  };
}

type Hub = ReturnType<typeof createHub>;
// Without a provider nothing flies: the counter just counts in place.
const TokenFlightContext = createContext<Hub>(createHub(null));

export const useTokenFlights = () => useContext(TokenFlightContext);

/**
 * For a view tokens come from or go to: put `ref` on it, plus `collapsable={false}` so the
 * native side keeps it measurable, and call `send` around the change (see top).
 */
export function useTokenOrigin() {
  const hub = useTokenFlights();
  const ref = useRef<View>(null);
  const send = useCallback((sign: Sign) => hub.send(ref.current, sign), [hub]);
  return [ref as RefObject<View>, send] as const;
}

/** Wraps the app and draws the flights above every screen. */
export function TokenFlightProvider({ children }: { children: ReactNode }) {
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [hub] = useState(() => createHub(setFlights));
  return (
    <TokenFlightContext.Provider value={hub}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {flights.map((f) => (
          <Flight key={f.id} {...f} />
        ))}
      </View>
    </TokenFlightContext.Provider>
  );
}

/** The "+N" / "−N" chip with a coin, also usable on its own. */
export function TokenChip({ delta }: { delta: number }) {
  const gain = delta > 0;
  return (
    <View style={[styles.chip, gain ? styles.chipGain : styles.chipSpend]}>
      <Text style={[styles.chipText, { color: gain ? colors.butterT : colors.coralD }]}>
        {t(gain ? 'tokens.gain' : 'tokens.spend', { count: Math.abs(delta) })}
      </Text>
      <Icon xml={coinXml} size={18} />
    </View>
  );
}

function Flight({ from, to, delta, onDone }: FlightData) {
  const [fx] = useState(() => {
    const appear = new Animated.Value(0);
    const x = new Animated.Value(0);
    const y = new Animated.Value(0);
    return {
      appear,
      x,
      y,
      style: {
        opacity: Animated.multiply(appear, x.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] })),
        transform: [
          { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [from.x, to.x] }) },
          { translateY: y.interpolate({ inputRange: [0, 1], outputRange: [from.y, to.y] }) },
          {
            scale: Animated.multiply(
              appear.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              x.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.85, 0.45] }),
            ),
          },
        ],
      },
    };
  });

  useEffect(() => {
    const native = { useNativeDriver: true };
    Animated.sequence([
      Animated.timing(fx.appear, { toValue: 1, duration: APPEAR_MS, easing: Easing.out(Easing.back(2.2)), ...native }),
      Animated.delay(delta > 0 ? HOLD_MS.gain : HOLD_MS.spend),
      // x eases both ways, y winds up then rushes in: the chip arcs up to the counter
      Animated.parallel([
        Animated.timing(fx.x, { toValue: 1, duration: FLY_MS, easing: Easing.inOut(Easing.cubic), ...native }),
        Animated.timing(fx.y, { toValue: 1, duration: FLY_MS, easing: Easing.back(1.2), ...native }),
      ]),
    ]).start(onDone);
  }, [fx, delta, onDone]);

  return (
    <Animated.View style={[styles.flight, fx.style]}>
      <TokenChip delta={delta} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A real box centred on (0, 0), moved by the transform (iOS may drop a zero-size view)
  flight: {
    position: 'absolute',
    left: -BOX.w / 2,
    top: -BOX.h / 2,
    width: BOX.w,
    height: BOX.h,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 2,
    borderRadius: 14,
    paddingLeft: 9,
    paddingRight: 6,
    paddingVertical: 2,
  },
  chipGain: { backgroundColor: colors.butterL, borderColor: '#ffe39a' },
  chipSpend: { backgroundColor: colors.coralL, borderColor: '#ffcfc5' },
  chipText: { fontFamily: fonts.display700, fontSize: 18 },
});
