import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { initialState } from '../../game/progress';
import { setLanguage, t } from '../../i18n';
import { LanguagePicker } from '../LanguagePicker';
import { BigButton, MissesBar } from '../RoundParts';
import { LetterKeyboard } from '../LetterKeyboard';
import { DeleteSheet } from '../Profile';
import { InfoContent } from '../InfoPages';
import { characterById } from '../../characters/rig';
import OnboardingScreen from '../../app/onboarding';
import { router } from 'expo-router';

const mockGame = { state: initialState(), changeLanguage: jest.fn() };
const mockAudio = { play: jest.fn(), continuation: () => () => true };
jest.mock('../../state/GameContext', () => ({ useGame: () => mockGame }));
jest.mock('../../audio/AudioProvider', () => ({ useSoundScope: () => mockAudio }));
jest.mock('../../audio', () => ({ sound: { play: jest.fn(), unlock: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
  SafeAreaInsetsContext: jest.requireActual('react').createContext(null),
}));
jest.mock('../versus/InviteLink', () => ({ OnboardingInvite: () => null }));

let view: ReactTestRenderer;
// Matched by props: on RN 0.86 the rendered node is not the exported Pressable, so findAllByType misses it.
const pressable = (label: string) => view.root.findAll(node => node.props?.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
beforeEach(() => { setLanguage('en'); mockGame.state = initialState(); jest.clearAllMocks(); });
afterEach(async () => { await act(async () => view?.unmount()); setLanguage('en'); });

test('already mounted text and memoized keys update immediately when the language changes', async () => {
  await act(async () => { view = create(<><MissesBar wrong={0} max={10} /><LetterKeyboard locked={false} keyState={() => 'idle'} onPress={() => {}} /></>); });
  expect(pressable('Letter A') !== undefined).toBe(true);
  await act(async () => setLanguage('fr'));
  expect(pressable('Lettre A') !== undefined).toBe(true);
  expect(view.root.findAllByType(Text).some(node => [node.props.children].flat().includes('/ 10 erreurs'))).toBe(true);
});

test('the first onboarding page has all native language names and continues to buddy selection', async () => {
  await act(async () => { view = create(<OnboardingScreen />); });
  expect(view.root.findByType(LanguagePicker)).toBeDefined();
  for (const name of ['English', 'Français', 'Español', 'Deutsch']) {
    expect(pressable(name) !== undefined).toBe(true);
  }
  const spanish = pressable('Español');
  await act(async () => spanish.props.onPress());
  expect(mockGame.changeLanguage).toHaveBeenCalledWith('es');
  await act(async () => view.root.findByType(BigButton).props.onPress());
  expect(router.push).toHaveBeenCalledWith('/onboarding/buddy');
});

test('German ß is a single usable key and Spanish Ñ appears on the keyboard', async () => {
  const press = jest.fn();
  await act(async () => { view = create(<LetterKeyboard language="de" locked={false} keyState={() => 'idle'} onPress={press} />); });
  const key = pressable('Letter ß');
  await act(async () => key.props.onPress());
  expect(press).toHaveBeenCalledWith('ß');
  await act(async () => view.update(<LetterKeyboard language="es" locked={false} keyState={() => 'idle'} onPress={press} />));
  expect(pressable('Letter Ñ') !== undefined).toBe(true);
});

test.each(['fr', 'es', 'de'])('%s account deletion requires the displayed translated confirmation word', async language => {
  setLanguage(language);
  const confirm = jest.fn(async () => true);
  await act(async () => { view = create(<DeleteSheet visible character={characterById('coco')} onClose={() => {}} onConfirm={confirm} />); });
  const button = () => view.root.findAllByType(BigButton).find(node => node.props.label === t('delete.confirm'))!;
  await act(async () => view.root.findByType(TextInput).props.onChangeText('DELETE'));
  expect(button().props.disabled).toBe(true);
  await act(async () => view.root.findByType(TextInput).props.onChangeText(t('delete.confirmWord')));
  expect(button().props.disabled).toBe(false);
  await act(async () => button().props.onPress());
  expect(confirm).toHaveBeenCalledTimes(1);
});

test.each(['en', 'fr', 'es', 'de'])('%s legal pages show every section, the date and the support email', async language => {
  setLanguage(language);
  for (const page of ['privacy', 'terms'] as const) {
    await act(async () => { view?.unmount(); view = create(<InfoContent page={page} />); });
    const texts = view.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
    expect(texts.filter(text => /^legal\.|\{\w+\}/.test(text))).toEqual([]);
    expect(texts.some(text => text.includes('2026'))).toBe(true);
    expect(texts).toContain('mudelkun56@gmail.com');
    expect(texts).toContain('github.com/basecamp/policies');
  }
});
