import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LANGUAGES } from '../game/languages';
import { useTranslation } from '../i18n';
import { useGame } from '../state/GameContext';
import { colors, fonts } from '../theme';
import { sound } from '../audio';
import { Raised } from './Raised';
import { BigButton } from './RoundParts';
import { Sheet, sheetText } from './Sheet';

/** Shared by the first onboarding step and Profile. Language names are always native. */
export function LanguagePicker() {
  const t = useTranslation();
  const { state, changeLanguage } = useGame();
  return <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={t('profile.language')}>
    {LANGUAGES.map(language => {
      const selected = language.id === state.language;
      return <Pressable key={language.id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
        accessibilityLabel={language.name} onPress={() => { sound.play('choose'); changeLanguage(language.id); }}>
        {({ pressed }) => <Raised depth={3} radius={18} pressed={pressed} shadowColor={selected ? colors.mintD : colors.shadow}
          style={[styles.option, selected && styles.selected]}>
          <Text style={styles.name}>{language.name}</Text>
          <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.dot} />}</View>
        </Raised>}
      </Pressable>;
    })}
  </View>;
}

export function LanguageSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslation();
  return <Sheet onClose={onClose} closeLabel={t('language.close')}>
    <Text style={sheetText.title} accessibilityRole="header">{t('language.title')}</Text>
    <Text style={sheetText.help}>{t('language.help')}</Text>
    <LanguagePicker />
    <Text style={sheetText.help}>{t('language.resume')}</Text>
    <BigButton label={t('language.close')} onPress={onClose} />
  </Sheet>;
}

const styles = StyleSheet.create({
  options: { gap: 14, marginVertical: 14 },
  option: { minHeight: 60, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line,
    paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selected: { borderColor: colors.mintD, backgroundColor: colors.mintL },
  name: { fontFamily: fonts.display600, fontSize: 21, color: colors.ink, flexShrink: 1 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.mintD },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.mintD },
});
