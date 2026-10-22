import { StyleSheet, Text, View } from 'react-native';
import { t, TranslationKey } from '../i18n';
import { colors, fonts } from '../theme';

export type LegalPage = 'terms' | 'privacy';
const HEADINGS: Record<LegalPage, TranslationKey[]> = {
  terms: ['legal.terms.playing', 'legal.terms.name', 'legal.terms.leaderboard'],
  privacy: ['legal.privacy.data', 'legal.privacy.name', 'legal.privacy.deletion'],
};
const LINES = [[96, 88, 93, 54], [91, 97, 72], [94, 86, 60]];

/** The design's explicit placeholder, shared with Profile. Replace with approved bundled text before release. */
export function LegalDocument({ page }: { page: LegalPage }) {
  return <View style={styles.document}>
    {HEADINGS[page].map((heading, i) => <View key={heading} style={styles.section}>
      <Text style={styles.heading}>{t(heading)}</Text>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.lines}>
        {LINES[i].map((width, j) => <View key={j} style={[styles.line, { width: `${width}%` }]} />)}
      </View>
    </View>)}
    <View style={styles.notice}><Text style={styles.noticeText}>{t('legal.placeholder')}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  document: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, borderRadius: 20, padding: 14, gap: 9 },
  section: { gap: 6 },
  heading: { fontFamily: fonts.display600, fontSize: 16, color: colors.ink },
  lines: { gap: 6 },
  line: { height: 5, borderRadius: 5, backgroundColor: '#f1e7db' },
  notice: { marginTop: 4, borderRadius: 14, backgroundColor: colors.butterL, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#f2cf6a', paddingVertical: 8, paddingHorizontal: 11 },
  noticeText: { fontFamily: fonts.body800, fontSize: 12.5, lineHeight: 17, color: colors.butterT },
});
