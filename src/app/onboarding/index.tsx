import { Redirect, router } from 'expo-router';
import { ScrollView, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguagePicker, languageStyles } from '../../components/LanguagePicker';
import { PaperBackground } from '../../components/PaperBackground';
import { BigButton } from '../../components/RoundParts';
import { useTranslation } from '../../i18n';
import { colors } from '../../theme';
import { useGame } from '../../state/GameContext';

export default function OnboardingScreen() {
  const t = useTranslation();
  const { state } = useGame();
  const insets = useSafeAreaInsets();
  if (state.onboardingCompleted) return <Redirect href="/onboarding/name" />;
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <PaperBackground />
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24,
      paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
      <Text style={[languageStyles.title, { color: colors.coralD, marginBottom: 24 }]}>{t('onboarding.logo')}</Text>
      <Text style={languageStyles.title} accessibilityRole="header">{t('language.title')}</Text>
      <Text style={languageStyles.help}>{t('language.help')}</Text>
      <LanguagePicker />
      <BigButton label={t('language.continue')} onPress={() => router.push('/onboarding/buddy')} />
      <Text style={languageStyles.help}>{t('onboarding.step', { step: 1, total: 3 })}</Text>
    </ScrollView>
  </View>;
}
