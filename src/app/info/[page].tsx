/*
 * One info & legal page, pushed from Profile: /info/rules, /info/privacy,
 * /info/terms, /info/support, /info/credits (src/components/InfoPages.tsx).
 * An unknown page goes back to Profile.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Column } from '../../components/Column';
import { BackHeader } from '../../components/GameHeader';
import { INFO_PAGES, InfoContent, isInfoPage } from '../../components/InfoPages';
import { PaperBackground } from '../../components/PaperBackground';
import { useTranslation } from '../../i18n';
import { colors } from '../../theme';
import { useLayout } from '../../theme/layout';

export default function InfoScreen() {
  const t = useTranslation();
  const { page } = useLocalSearchParams<{ page: string }>();
  const insets = useSafeAreaInsets();
  const { column, gutter } = useLayout();
  if (!isInfoPage(page)) return <Redirect href="/profile" />;

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <Column fill={false}>
        <View style={{ height: insets.top }} />
        <BackHeader title={t(INFO_PAGES[page].title)} />
      </Column>
      <ScrollView
        contentContainerStyle={[styles.body, { width: column, paddingHorizontal: gutter, paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <InfoContent page={page} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  // Centred on a tablet; the scroll view itself spans the screen, so the sides scroll too
  body: { alignSelf: 'center', paddingTop: 4 },
});
