import { Ref, useCallback, useState } from 'react';
import { TextInput, TextInputInstance, TextInputProps } from 'react-native';
import { NAME_MAX, NAME_MIN, NameCheck, NameProblem } from '../game/names';
import { t, Translator, TranslationKey, useTranslation } from '../i18n';
import { colors } from '../theme';

const PROBLEM_TEXT: Record<NameProblem, TranslationKey> = {
  short: 'profile.name.short', long: 'profile.name.long',
  characters: 'profile.name.characters', blocked: 'profile.name.blocked', taken: 'profile.name.taken',
};
export const nameHelp = (problem: NameProblem | null, translate: Translator = t) =>
  translate(problem ? PROBLEM_TEXT[problem] : 'profile.name.help', { min: NAME_MIN, max: NAME_MAX });

/** The problem to show: "too short" waits for `showShort` (every name starts too short), and a name the server said is taken. */
export const nameProblem = (check: NameCheck, showShort: boolean, taken: string | null): NameProblem | null =>
  !check.ok ? (check.problem !== 'short' || showShort ? check.problem : null) : check.name === taken ? 'taken' : null;

/**
 * Names are unique: before keeping one, ask the server. `taken` remembers the
 * last name it refused, for nameProblem. Offline it lets the name through, and
 * the sync gives a taken one a free variant later. `nameIsFree`: GameContext's.
 */
export function useNameAvailability(nameIsFree: (name: string) => Promise<boolean>) {
  const [taken, setTaken] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const isFree = useCallback(async (name: string) => {
    setChecking(true);
    const free = await nameIsFree(name);
    setChecking(false);
    if (!free) setTaken(name);
    return free;
  }, [nameIsFree]);
  return { taken, checking, isFree };
}

/** Shared editing behavior for Profile and onboarding; each supplies its own layout. */
export function PlayerNameInput(props: TextInputProps & { ref?: Ref<TextInputInstance> }) {
  const t = useTranslation();
  return <TextInput maxLength={NAME_MAX} autoCapitalize="words" autoCorrect={false} autoComplete="off"
    returnKeyType="done" placeholder={t('profile.name.placeholder')} placeholderTextColor={colors.muted}
    accessibilityLabel={t('profile.name.placeholder')} {...props} />;
}
