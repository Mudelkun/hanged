/*
 * The token counter in the header. When the balance changes, the amount
 * flies in from where it was earned or spent (TokenFlight), and only when it
 * lands does the number count to the new balance, one token at a time:
 *   - gain: the coin flips once per token, the pill pops, sparkles burst.
 *   - spend: the pill squishes and the coin wobbles.
 * A change nobody sent from is counted in place after a moment. The balance
 * the pill mounts with (the saved one) never animates.
 * Only ONE live pill may be mounted (flights land on it): Play's. Other
 * screens show StillTokenPill.
 */
import { memo, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { colors, fonts } from '../theme';
import { coinXml, Icon } from './icons';
import { popFrom } from './motion';
import { SparkBurst } from './SparkBurst';
import { useTokenFlights } from './TokenFlight';

/** A change waits this long for its origin (a win's badge appears ~700 ms after the guess, later on a slow phone). */
const WAIT_ORIGIN_MS = 4000;
/** A count lasts about this long, whatever the amount (each step 45–120 ms). */
const COUNT_MS = 700;

interface Change {
  /** Number on screen when the balance changed (mid-count if one was running). */
  from: number;
  to: number;
  /** Real change of the balance, carried by the flight. */
  delta: number;
}

/** All animated values and their styles, built once per pill. */
function createFx() {
  const bump = new Animated.Value(1);
  const spin = new Animated.Value(0);
  const burst = new Animated.Value(1);
  const turn = Animated.modulo(spin, 1);
  return {
    bump,
    spin,
    burst,
    pill: { transform: [{ scale: bump }] },
    // One full coin flip per token counted
    coinGain: {
      transform: [{ scaleX: turn.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.05, -1, 0.05, 1] }) }],
    },
    coinSpend: {
      transform: [
        { rotate: spin.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 1], outputRange: ['0deg', '-20deg', '14deg', '-7deg', '0deg'] }) },
      ],
    },
  };
}

const run = (value: Animated.Value, toValue: number, duration: number, easing: (v: number) => number) =>
  Animated.timing(value, { toValue, duration, easing, useNativeDriver: true }).start();

export const TokenPill = memo(function TokenPill({ tokens }: { tokens: number }) {
  const flights = useTokenFlights();
  const [fx] = useState(createFx);
  const [shown, setShown] = useState(tokens);
  const [prev, setPrev] = useState(tokens);
  const [change, setChange] = useState<Change | null>(null);
  // A new balance starts a new animation, counting on from what's on screen
  if (tokens !== prev) {
    setPrev(tokens);
    setChange({ from: shown, to: tokens, delta: tokens - prev });
  }

  useEffect(() => {
    if (!change) return;
    const { from, to, delta } = change;
    const gain = delta > 0;
    const sign = Math.sign(to - from);
    const steps = Math.abs(to - from);
    const stepMs = Math.min(120, Math.max(45, Math.round(COUNT_MS / Math.max(steps, 1))));
    let cancelled = false;
    let counting = false;
    let taken = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let step = 0;
    const tick = () => {
      step += 1;
      setShown(from + sign * step);
      popFrom(fx.bump, gain ? 1.18 : 0.86);
      if (step < steps) timer = setTimeout(tick, stepMs);
    };
    const count = () => {
      if (cancelled || counting) return;
      counting = true;
      fx.spin.setValue(0);
      if (gain) {
        fx.burst.setValue(0);
        run(fx.burst, 1, 650, Easing.out(Easing.quad));
        run(fx.spin, steps, steps * stepMs, Easing.linear);
      } else run(fx.spin, 1, 450, Easing.linear);
      if (steps) tick();
    };

    const cancelWait = flights.awaitOrigin(gain ? 1 : -1, (origin) => {
      taken = true;
      clearTimeout(fallback);
      flights.fly(origin, delta, count);
    });
    // Nobody sent this change from anywhere: count it in place
    if (!taken)
      fallback = setTimeout(() => {
        cancelWait();
        count();
      }, WAIT_ORIGIN_MS);
    return () => {
      cancelled = true;
      cancelWait();
      clearTimeout(fallback);
      clearTimeout(timer);
    };
  }, [change, fx, flights]);

  const spending = !!change && change.delta < 0;

  return (
    <View accessible accessibilityLabel={t('header.a11y.tokens', { count: tokens })}>
      <Animated.View style={[styles.pillShadow, fx.pill]}>
        <View style={styles.pill}>
          <View ref={flights.setTarget} collapsable={false} style={styles.coin}>
            {change && !spending && <SparkBurst burst={fx.burst} reach={27} />}
            <Animated.View style={spending ? fx.coinSpend : fx.coinGain}>
              <Icon xml={coinXml} size={24} />
            </Animated.View>
          </View>
          <Text style={styles.pillText}>{shown}</Text>
        </View>
      </Animated.View>
    </View>
  );
});

/** The same pill without flights or counting, for screens where tokens don't move (Leaderboard). */
export const StillTokenPill = memo(function StillTokenPill({ tokens }: { tokens: number }) {
  return (
    <View accessible accessibilityLabel={t('header.a11y.tokens', { count: tokens })} style={styles.pillShadow}>
      <View style={styles.pill}>
        <Icon xml={coinXml} size={24} />
        <Text style={styles.pillText}>{tokens}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pillShadow: { borderRadius: 17, backgroundColor: '#f6dc9c', paddingBottom: 3 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderColor: '#ffe39a',
    borderWidth: 2,
    borderRadius: 17,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 11,
  },
  pillText: { fontFamily: fonts.display700, fontSize: 19, color: colors.butterT },
  coin: { width: 24, height: 24 },
});
