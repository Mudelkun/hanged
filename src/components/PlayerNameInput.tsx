import { Ref } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { NAME_MAX, NAME_MIN, NameProblem } from '../game/names';
import { t, TranslationKey } from '../i18n';
import { colors } from '../theme';

const PROBLEM_TEXT: Record<NameProblem, TranslationKey> = {
  short: 'profile.name.short', long: 'profile.name.long',
  characters: 'profile.name.characters', blocked: 'profile.name.blocked',
};
export const nameHelp = (problem: NameProblem | null) =>
  t(problem ? PROBLEM_TEXT[problem] : 'profile.name.help', { min: NAME_MIN, max: NAME_MAX });

/** Shared editing behavior for Profile and onboarding; each supplies its own layout. */
export function PlayerNameInput(props: TextInputProps & { ref?: Ref<TextInput> }) {
  return <TextInput maxLength={NAME_MAX} autoCapitalize="words" autoCorrect={false} autoComplete="off"
    returnKeyType="done" placeholder={t('profile.name.placeholder')} placeholderTextColor={colors.muted}
    accessibilityLabel={t('profile.name.placeholder')} {...props} />;
}
