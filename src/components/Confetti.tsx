/*
 * A confetti burst, like a party popper: thrown from `origin` toward `aim`
 * while `fire` runs 0 → 1, the pieces fly out, tumble and fall under gravity.
 * One value drives every piece, all on the native driver. Reuse it for any big
 * celebration (the streak bonus first); give each popper its own `seed`.
 */
import { memo, useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';

const COUNT = 46;
/** Samples of each piece's fall: enough for a smooth parabola from a linear `fire`. */
const SAMPLES = [0, 0.15, 0.3, 0.5, 0.7, 1];
const GRAVITY = 2.2;
/**
 * Samples of each piece's flutter (a scaleY between 1 and -1, like a coin flip seen side on).
 * Never a 3D transform (rotateX/rotateY/perspective): on iOS one 3D-tilted layer makes Core
 * Animation depth-sort its flat neighbours, slicing the whole card along long diagonal lines.
 */
const FLUTTER = Array.from({ length: 25 }, (_, k) => k / 24);
/** The fan's full opening, in radians. */
const SPREAD = Math.PI * 0.55;

// Deterministic pieces in units of the burst's box, so a burst looks thrown, never random per render
const cache = new Map<string, ReturnType<typeof makePieces>>();
function makePieces(seed: number, aim: number) {
  let n = seed;
  const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: COUNT }, (_, i) => {
    const angle = aim + (rnd() - 0.5) * SPREAD;
    const speed = 1.5 + rnd() * 1.1;
    return {
      vx: Math.cos(angle) * speed * 0.5,
      vy: Math.sin(angle) * speed,
      spin: (rnd() - 0.5) * 5,
      color: i,
      round: rnd() < 0.3,
      w: 7 + rnd() * 4,
      h: 11 + rnd() * 6,
    };
  });
}
const piecesFor = (seed: number, aim: number) => {
  const key = `${seed}:${aim}`;
  if (!cache.has(key)) cache.set(key, makePieces(seed, aim));
  return cache.get(key)!;
};

interface Props {
  fire: Animated.Value;
  width: number;
  height: number;
  origin: { x: number; y: number };
  /** Direction of the fan's middle, in radians (-π/2 = straight up). */
  aim?: number;
  seed?: number;
  colors: readonly string[];
}

export const Confetti = memo(function Confetti({ fire, width, height, origin, aim = -Math.PI / 2, seed = 11, colors }: Props) {
  const pieces = useMemo(
    () =>
      piecesFor(seed, aim).map((p) => ({
        key: p.color,
        size: p.round ? { width: p.w, height: p.w, borderRadius: p.w / 2 } : { width: p.w, height: p.h, borderRadius: 2 },
        backgroundColor: colors[p.color % colors.length],
        opacity: fire.interpolate({ inputRange: [0, 0.03, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          // x slows down like it meets air, y is thrown up and falls back
          { translateX: fire.interpolate({ inputRange: SAMPLES, outputRange: SAMPLES.map((s) => origin.x + p.vx * width * (1 - (1 - s) ** 2)) }) },
          { translateY: fire.interpolate({ inputRange: SAMPLES, outputRange: SAMPLES.map((s) => origin.y + (p.vy * s + GRAVITY * s * s) * height) }) },
          { rotate: fire.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] }) },
          // The flutter is a flat squash, never rotateX: see FLUTTER
          { scaleY: fire.interpolate({ inputRange: FLUTTER, outputRange: FLUTTER.map((s) => Math.cos(s * p.spin * 3 * Math.PI)) }) },
        ],
      })),
    [fire, width, height, origin.x, origin.y, aim, seed, colors],
  );
  return (
    <>
      {pieces.map(({ key, size, ...style }) => (
        <Animated.View key={key} pointerEvents="none" style={[styles.piece, size, style]} />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
});
