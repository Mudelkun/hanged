/* Cream paper with the mockup's soft dot grid (18px). */
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

import { colors } from '../theme';

export function PaperBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <Pattern id="paperDots" width={18} height={18} patternUnits="userSpaceOnUse">
          <Circle cx={9} cy={9} r={1.4} fill={colors.paperDot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={colors.paper} />
      <Rect width="100%" height="100%" fill="url(#paperDots)" />
    </Svg>
  );
}
