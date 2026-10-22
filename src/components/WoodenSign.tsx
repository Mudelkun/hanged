import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { worldColors } from '../theme';
import { Raised } from './Raised';

export function WoodenSign({ children, style, radius = 16 }: { children: ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  return <Raised depth={4} shadowColor={worldColors.signD} radius={radius}
    style={[{ backgroundColor: worldColors.sign, borderWidth: 2, borderColor: worldColors.signD }, style]}>{children}</Raised>;
}
