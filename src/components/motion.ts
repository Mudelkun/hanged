/*
 * Shared animation helpers, so every "pop" in the game has the same spring.
 */
import { Animated } from 'react-native';

/** Jump to `from` (e.g. 0.55 = shrunk, 1.25 = swollen), then spring back to 1. */
export function popFrom(value: Animated.Value, from: number) {
  value.setValue(from);
  Animated.spring(value, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
}
