/*
 * One info & legal page, pushed from Profile: /info/rules, /info/privacy,
 * /info/terms, /info/support, /info/credits (src/components/InfoPages.tsx).
 * An unknown page goes back to Profile.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '../../components/GameHeader';
import { INFO_PAGES, InfoContent, isInfoPage } from '../../components/InfoPages';
import { PaperBackground } from '../../components/PaperBackground';
import { t } from '../../i18n';
import { colors } from '../../theme';

export default function InfoScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const insets = useSafeAreaInsets();
  if (!isInfoPage(page)) return <Redirect href="/profile" />;

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <View style={{ height: insets.top }} />
      <BackHeader title={t(INFO_PAGES[page].title)} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        <InfoContent page={page} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 16, paddingTop: 4 },
});
