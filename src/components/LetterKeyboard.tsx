/*
 * The in-game keyboard: letters only, never the system keyboard.
 * Used keys stay in place but change look (mockup): correct = mint,
 * wrong = grey, sunk, no shadow, letter faded (owner: show the letter, not a ✕,
 * so the player sees what they already tried), clue = butter. A used key, or any
 * key once the round is over, cannot be pressed.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyState, Letter } from '../game/engine';
import { t } from '../i18n';
import { colors, fonts } from '../theme';
import { Raised } from './Raised';

// Same letter order as the iPhone keyboard (QWERTY), rows centred like iOS.
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const PER_ROW = ROWS[0].length;
const GAP = 5;

const LOOK: Record<Exclude<KeyState, 'no'>, { bg: string; border: string; shadow: string; text: string }> = {
  idle: { bg: '#fff', border: colors.line, shadow: colors.shadow, text: colors.ink },
  ok: { bg: colors.mint, border: colors.mint, shadow: colors.mintD, text: '#fff' },
  clue: { bg: colors.butter, border: colors.butter, shadow: colors.butterD, text: '#7a5300' },
};

const Key = memo(function Key({ letter, state, locked, w, h, onPress }: {
  letter: Letter; state: KeyState; locked: boolean; w: number; h: number; onPress: (c: Letter) => void;
}) {
  const used = state !== 'idle';
  const radius = Math.min(14, Math.round(w * 0.3));
  const fontSize = Math.round(Math.min(h * 0.46, w * 0.68));
  const label = used ? t('play.a11y.key.used', { letter: letter.toUpperCase() }) : t('play.a11y.key', { letter: letter.toUpperCase() });
  if (state === 'no') {
    return (
      <View accessible accessibilityLabel={label} style={[styles.key, styles.keyNo, { width: w, height: h, borderRadius: radius, marginTop: 4 }]}>
        <Text style={[styles.keyText, styles.keyNoText, { fontSize }]}>{letter.toUpperCase()}</Text>
      </View>
    );
  }
  const c = LOOK[state];
  return (
    <Pressable
      onPress={() => onPress(letter)}
      disabled={used || locked}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: used || locked }}
      hitSlop={2}
    >
      {({ pressed }) => (
        <Raised
          shadowColor={c.shadow}
          radius={radius}
          pressed={pressed}
          style={[styles.key, { width: w, height: h, borderRadius: radius, backgroundColor: c.bg, borderColor: c.border }]}
        >
          <Text style={[styles.keyText, { color: c.text, fontSize }]}>{letter.toUpperCase()}</Text>
        </Raised>
      )}
    </Pressable>
  );
});

interface Props {
  keyState: (c: Letter) => KeyState;
  locked: boolean;
  onPress: (c: Letter) => void;
  available: number;
  compact: boolean;
}

export function LetterKeyboard({ keyState, locked, onPress, available, compact }: Props) {
  const w = Math.floor(Math.min(44, (available - GAP * (PER_ROW - 1)) / PER_ROW));
  // iOS keys are taller than wide; 10 keys per row makes them narrow.
  const h = compact ? Math.min(42, Math.round(w * 1.35)) : Math.min(48, Math.round(w * 1.45));
  return (
    <View style={[styles.kb, { gap: compact ? 5 : 7 }]}>
      {ROWS.map((row) => (
        <View key={row} style={styles.row}>
          {row.split('').map((c) => (
            <Key key={c} letter={c} state={keyState(c)} locked={locked} w={w} h={h} onPress={onPress} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  kb: { alignItems: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', gap: GAP },
  key: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  keyNo: { backgroundColor: colors.keyUsed, borderColor: colors.keyUsed },
  keyNoText: { color: colors.muted, opacity: 0.75 },
  keyText: { fontFamily: fonts.display600 },
});
