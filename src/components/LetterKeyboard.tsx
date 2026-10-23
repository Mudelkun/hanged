/*
 * The in-game keyboard: letters only, never the system keyboard.
 * Used keys stay in place but change look (mockup): correct = mint,
 * wrong = grey, sunk, no shadow, letter faded (owner: show the letter, not a ✕,
 * so the player sees what they already tried), clue = butter. Easy levels
 * disable some letters that are not in the word: their key is an empty dashed
 * slot, so the QWERTY layout doesn't shift. A used key, or any key once the
 * round is over, cannot be pressed. In Versus a key just sent is `pending`
 * (faded, not pressable) until the server says whether it's in the word.
 */
import { memo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyState, Letter } from '../game/engine';
import { displayLetter, isLanguage, KEYBOARD_ROWS } from '../game/languages';
import { useTranslation } from '../i18n';
import { colors, fonts } from '../theme';
import { Raised } from './Raised';

// Same letter order as the iPhone keyboard (QWERTY), rows centred like iOS.
const GAP = 5;

const LOOK: Record<Exclude<KeyState, 'no' | 'off'>, { bg: string; border: string; shadow: string; text: string }> = {
  idle: { bg: '#fff', border: colors.line, shadow: colors.shadow, text: colors.ink },
  ok: { bg: colors.mint, border: colors.mint, shadow: colors.mintD, text: '#fff' },
  clue: { bg: colors.butter, border: colors.butter, shadow: colors.butterD, text: '#7a5300' },
};

const Key = memo(function Key({ letter, state, locked, pending, w, h, onPress }: {
  letter: Letter; state: KeyState; locked: boolean; pending: boolean; w: number; h: number; onPress: (c: Letter) => void;
}) {
  const t = useTranslation();
  const used = state !== 'idle';
  const radius = Math.min(14, Math.round(w * 0.3));
  const fontSize = Math.round(Math.min(h * 0.46, w * 0.68));
  const label = t(state === 'off' ? 'play.a11y.key.off' : used ? 'play.a11y.key.used' : 'play.a11y.key', {
    letter: displayLetter(letter),
  });
  if (state === 'off') {
    return (
      <View accessible accessibilityLabel={label} style={[styles.key, styles.keyOff, { width: w, height: h, borderRadius: radius, marginTop: 4 }]} />
    );
  }
  if (state === 'no') {
    return (
      <View accessible accessibilityLabel={label} style={[styles.key, styles.keyNo, { width: w, height: h, borderRadius: radius, marginTop: 4 }]}>
        <Text style={[styles.keyText, styles.keyNoText, { fontSize }]}>{displayLetter(letter)}</Text>
      </View>
    );
  }
  const c = LOOK[state];
  return (
    <Pressable
      onPress={() => onPress(letter)}
      disabled={used || locked || pending}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: used || locked || pending, busy: pending }}
      hitSlop={2}
      style={pending && styles.keyPending}
    >
      {({ pressed }) => (
        <Raised
          shadowColor={c.shadow}
          radius={radius}
          pressed={pressed}
          style={[styles.key, { width: w, height: h, borderRadius: radius, backgroundColor: c.bg, borderColor: c.border }]}
        >
          <Text style={[styles.keyText, { color: c.text, fontSize }]}>{displayLetter(letter)}</Text>
        </Raised>
      )}
    </Pressable>
  );
});

interface Props {
  language?: string;
  keyState: (c: Letter) => KeyState;
  /** Versus: sent, not judged yet. */
  pending?: (c: Letter) => boolean;
  locked: boolean;
  onPress: (c: Letter) => void;
  available: number;
  compact: boolean;
}

// The keyboard reaches a little past the screen's side padding, like the iOS one, for wider keys.
const BLEED = 10;
const PAD_BOTTOM = 4;
const DEPTH = 4; // Raised's shadow under each key
// Last height the keyboard was given, so a new round's keyboard starts at the right size (no clipped frame).
let lastHeight = 0;

/*
 * Keys are as big as they like (`h` up to 1.6 × width) when there is room, and shrink
 * (down to `minH`) only when the screen runs out of it. The keyboard asks for its
 * full size as a flex basis and may shrink; the scene gives up its height first
 * (it is the only part that grows), so anything added to the Play screen later
 * takes the scene's spare room, then the keys', and nothing ever overflows.
 */
export function LetterKeyboard({ keyState, pending, locked, onPress, available, compact, language = 'en' }: Props) {
  const [height, setHeight] = useState(lastHeight);
  const rows = KEYBOARD_ROWS[isLanguage(language) ? language : 'en'];
  const perRow = Math.max(...rows.map(row => row.length));
  const w = Math.floor(Math.min(48, (available + 2 * BLEED - GAP * (perRow - 1)) / perRow));
  // iOS keys are taller than wide; 10 keys per row makes them narrow.
  const maxH = compact ? Math.min(48, Math.round(w * 1.45)) : Math.min(58, Math.round(w * 1.6));
  const minH = compact ? 34 : 38;
  const rowGap = compact ? 6 : 8;
  const padTop = compact ? 8 : 12;
  const chrome = padTop + PAD_BOTTOM + 2 * rowGap + 3 * DEPTH;
  const fits = height ? Math.floor((height - chrome) / 3) : maxH;
  const h = Math.max(minH, Math.min(maxH, fits));
  const onLayout = (e: LayoutChangeEvent) => {
    lastHeight = e.nativeEvent.layout.height;
    setHeight(lastHeight);
  };
  return (
    <View
      onLayout={onLayout}
      style={[styles.kb, { gap: rowGap, paddingTop: padTop, flexBasis: chrome + 3 * maxH, minHeight: chrome + 3 * minH }]}
    >
      {rows.map((row) => (
        <View key={row} style={styles.row}>
          {row.split('').map((c) => (
            <Key key={c} letter={c} state={keyState(c)} locked={locked} pending={!!pending?.(c)} w={w} h={h} onPress={onPress} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  kb: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 'auto',
    marginHorizontal: -BLEED,
    paddingBottom: PAD_BOTTOM,
    flexGrow: 0,
    flexShrink: 1,
  },
  row: { flexDirection: 'row', gap: GAP },
  key: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  keyNo: { backgroundColor: colors.keyUsed, borderColor: colors.keyUsed },
  keyOff: { borderStyle: 'dashed', borderColor: colors.line },
  keyNoText: { color: colors.muted, opacity: 0.75 },
  keyPending: { opacity: 0.45 },
  keyText: { fontFamily: fonts.display600 },
});
