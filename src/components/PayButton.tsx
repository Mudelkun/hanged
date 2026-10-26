/*
 * The coral "label + coin" button that spends tokens: the letter shop's price and the Characters page's Unlock. It sends
 * the token flight from itself, then pays. Without enough tokens it turns
 * beige and refuses (pair it with useRefusal to say why). Reuse it for any
 * new spend.
 */
import { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '../theme';
import { coinXml, Icon } from './icons';
import { Raised } from './Raised';
import { MEASURABLE, useTokenOrigin } from './TokenFlight';
import { sound } from '../audio';

/** True for 2.2 s after `refuse()`: a press without enough tokens shows "Not enough tokens yet". */
export function useRefusal(): [boolean, () => void] {
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!refused) return;
    const id = setTimeout(() => setRefused(false), 2200);
    return () => clearTimeout(id);
  }, [refused]);
  return [refused, () => setRefused(true)];
}

interface Props {
  label: string;
  a11yLabel: string;
  canAfford: boolean;
  onPay?: () => void;
  onRefuse: () => void;
  icon?: ReactNode;
  /** Set when the button sits inside a pill: its height there. */
  pillHeight?: number;
  /** Full width and BigButton's size (a page's main action). */
  big?: boolean;
}

export function PayButton({ label, a11yLabel, canAfford, onPay, onRefuse, icon, pillHeight, big }: Props) {
  const [ref, sendToken] = useTokenOrigin();
  const small = pillHeight !== undefined;
  const press = () => {
    sound.unlock();
    // Measure the button before paying: it's gone once the purchase shows
    if (canAfford) sendToken(-1).then(() => onPay?.());
    else { sound.play('refused'); onRefuse(); }
  };
  return (
    <Pressable
      ref={ref}
      {...MEASURABLE}
      onPress={press}
      hitSlop={small ? 6 : undefined}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: !canAfford }}
    >
      {({ pressed }) => (
        <Raised
          depth={small ? 3 : big ? 5 : 4}
          shadowColor={canAfford ? colors.coralD : '#dccbb8'}
          radius={small ? 10 : big ? 20 : 15}
          pressed={pressed}
          outerStyle={big && styles.bigOuter}
          style={[styles.pay, small && [styles.small, { height: pillHeight }], big && styles.big, !canAfford && styles.broke]}
        >
          {icon}
          <Text style={[styles.text, big && styles.bigText]}>{label}</Text>
          <Icon xml={coinXml} size={small ? 16 : big ? 24 : 18} />
        </Raised>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pay: {
    backgroundColor: colors.coral,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  small: { paddingVertical: 0, paddingHorizontal: 9, gap: 4 },
  bigOuter: { marginVertical: 8 },
  big: { height: 56, paddingVertical: 0, justifyContent: 'center', gap: 7 },
  broke: { backgroundColor: '#e9dccd' },
  text: { fontFamily: fonts.display600, fontSize: 15, color: '#fff' },
  bigText: { fontSize: 20, letterSpacing: 0.2 },
});
