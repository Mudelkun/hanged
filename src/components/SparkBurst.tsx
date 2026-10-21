/*
 * Sparkles thrown out from the centre of their parent while `burst` runs
 * 0 → 1. The token pill's gain and a level-up share this one burst.
 */
import { memo, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { Icon, sparkXml } from './icons';

const COUNT = 6;
const SPARK = sparkXml();

function sparkStyles(burst: Animated.Value, reach: number) {
  return Array.from({ length: COUNT }, (_, i) => {
    const angle = (i / COUNT) * 2 * Math.PI - Math.PI / 2;
    // Every other spark stops short, so the ring looks thrown, not drawn
    const r = i % 2 ? reach * 0.74 : reach;
    return {
      opacity: burst.interpolate({ inputRange: [0, 0.1, 0.6, 1], outputRange: [0, 1, 1, 0] }),
      transform: [
        { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * r] }) },
        { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * r] }) },
        { scale: burst.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.2, 1, 0.3] }) },
      ],
    };
  });
}

export const SparkBurst = memo(function SparkBurst({ burst, reach, size = 12 }: { burst: Animated.Value; reach: number; size?: number }) {
  const [sparks] = useState(() => sparkStyles(burst, reach));
  const at = { marginLeft: -size / 2, marginTop: -size / 2 };
  return (
    <>
      {sparks.map((style, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.spark, at, style]}>
          <Icon xml={SPARK} size={size} />
        </Animated.View>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  spark: { position: 'absolute', left: '50%', top: '50%' },
});
