/*
 * A screen's content column (theme/layout.ts): the whole width on a phone, a
 * centred column on a tablet. The screen draws its full-bleed parts (the
 * paper, a sky) outside it, and everything else (header, body, tab bar) inside.
 * `fill={false}` for a column only as tall as its content (a scrolling page's header).
 */
import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLayout } from '../theme/layout';

export function Column({ children, fill = true }: { children: ReactNode; fill?: boolean }) {
  const { column } = useLayout();
  return <View style={[styles.column, fill && styles.fill, { width: column }]}>{children}</View>;
}

const styles = StyleSheet.create({
  column: { alignSelf: 'center' },
  fill: { flex: 1, minHeight: 0 },
});
