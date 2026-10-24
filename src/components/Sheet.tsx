/*
 * The bottom sheet over a dimmed screen: the language picker's and the daily
 * reminder's. Tapping outside closes it (`closeLabel` names that for VoiceOver).
 */
import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme';

export function Sheet({ onClose, closeLabel, children }: { onClose: () => void; closeLabel: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <Modal transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.dim, { paddingTop: insets.top + 24 }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
      <View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}

/** A sheet's title and its centred help lines (also the first onboarding step's). */
export const sheetText = StyleSheet.create({
  title: { fontFamily: fonts.display700, fontSize: 30, color: colors.ink, textAlign: 'center' },
  help: { fontFamily: fonts.body700, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', marginVertical: 12 },
});

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(75,58,53,.42)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.paper },
  content: { padding: 22 },
});
