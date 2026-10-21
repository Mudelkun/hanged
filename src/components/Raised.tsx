/*
 * The mockup's signature "raised" look: a solid, unblurred shadow straight
 * under the element (CSS `box-shadow: 0 4px 0 <color>`). React Native
 * shadows blur, so this draws it as a coloured block peeking out below.
 * `pressed` sinks the element into its shadow, like a key going down.
 */
import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

interface Props {
  depth?: number;
  shadowColor: string;
  radius: number;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
  outerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Raised({ depth = 4, shadowColor, radius, pressed, style, outerStyle, children }: Props) {
  const d = pressed ? 0 : depth;
  return (
    <View style={[{ borderRadius: radius, backgroundColor: shadowColor, paddingBottom: d, marginTop: depth - d }, outerStyle]}>
      <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>{children}</View>
    </View>
  );
}
