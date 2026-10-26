import { Redirect, router } from 'expo-router';
import { ScrollView, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguagePicker } from '../../components/LanguagePicker';
import { OnboardingInvite } from '../../components/versus/InviteLink';
import { sheetText } from '../../components/Sheet';
import { PaperBackground } from '../../components/PaperBackground';
import { BigButton } from '../../components/RoundParts';
import { Wordmark } from '../../components/Wordmark';
import { useTranslation } from '../../i18n';
import { colors } from '../../theme';
import { useLayout } from '../../theme/layout';
import { useGame } from '../../state/GameContext';

export default function OnboardingScreen() {
  const t = useTranslation();
  const { state } = useGame();
  const insets = useSafeAreaInsets();
  const { column, narrow, type } = useLayout();
  if (state.onboardingCompleted) return <Redirect href="/onboarding/name" />;
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <PaperBackground />
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', width: column, alignSelf: 'center',
      paddingHorizontal: narrow ? 16 : 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
      <View style={{ alignItems: 'center', marginBottom: 18 }} accessible accessibilityLabel={t('app.name')}><Wordmark width={Math.round(250 * type)} /></View>
      <OnboardingInvite />
      <Text style={sheetText.title} accessibilityRole="header">{t('language.title')}</Text>
      <Text style={sheetText.help}>{t('language.help')}</Text>
      <LanguagePicker />
      <BigButton label={t('language.continue')} onPress={() => router.push('/onboarding/buddy')} />
      <Text style={sheetText.help}>{t('onboarding.step', { step: 1, total: 3 })}</Text>
    </ScrollView>
  </View>;
}
