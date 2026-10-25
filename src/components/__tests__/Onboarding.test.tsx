import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { initialState } from '../../game/progress';
import { OnboardingProvider } from '../../state/OnboardingContext';
import { BuddyScreen, NameScreen } from '../Onboarding';
import { BigButton } from '../RoundParts';
import { LiftOff } from '../OnboardingArt';

const mockGame = { state: { ...initialState(), playerName: 'SunnyOtter' }, completeOnboarding: jest.fn(), nameIsFree: jest.fn(async () => true) };
const mockAudio = { play: jest.fn(), voice: jest.fn(), cancel: jest.fn() };
jest.mock('../../state/GameContext', () => ({ useGame: () => mockGame }));
jest.mock('../../audio/AudioProvider', () => ({ useSoundScope: () => mockAudio }));
jest.mock('../../audio', () => ({ sound: { play: jest.fn(), unlock: jest.fn() } }));
jest.mock('../../feedback', () => ({ feedback: { refused: jest.fn(), characterPicked: jest.fn(), unlock: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useIsFocused: () => true, Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../OnboardingArt', () => ({ BuddyGlow: () => null, LiftOff: () => null, NameStage: () => null,
  OnboardingBalloon: () => null, OnboardingCloud: () => null, OnboardingSky: () => null, OnboardingSun: () => null }));

let view: ReactTestRenderer;
const button = (label: string) => view.root.findAllByType(BigButton).find(node => node.props.label === label)!;
const checkbox = () => view.root.findByProps({ accessibilityRole: 'checkbox' });
const enter = async (name: string) => { await act(async () => view.root.findByType(TextInput).props.onChangeText(name)); };
const shows = (text: string) => view.root.findAllByType(Text).some(node => node.props.children === text);

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  mockGame.state = { ...initialState(), playerName: 'SunnyOtter' };
});
afterEach(async () => { await act(async () => view?.unmount()); jest.clearAllTimers(); jest.useRealTimers(); });

test('both free buddies can be chosen and continue uses Expo Router', async () => {
  await act(async () => { view = create(<OnboardingProvider><BuddyScreen /></OnboardingProvider>); });
  expect(button('Let’s go, Coco!')).toBeDefined();
  const bun = view.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Choose Bun')[0];
  await act(async () => bun.props.onPress());
  expect(button('Let’s go, Bun!')).toBeDefined();
  await act(async () => button('Let’s go, Bun!').props.onPress());
  expect(router.push).toHaveBeenCalledWith('/onboarding/name');
});

test('consent starts unchecked, refusal nudges it, and invalid names never start lift-off', async () => {
  await act(async () => { view = create(<OnboardingProvider><NameScreen /></OnboardingProvider>); });
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  expect(button('Let’s play!').props.muted).toBe(true);
  await act(async () => button('Let’s play!').props.onPress());
  expect(shows('Tick the box to start playing')).toBe(true);
  await act(async () => checkbox().props.onPress());
  await enter('Admin');
  expect(shows("Let's pick a friendlier name")).toBe(true);
  await act(async () => button('Let’s play!').props.onPress());
  expect(view.root.findAllByType(LiftOff)).toHaveLength(0);
  expect(mockGame.completeOnboarding).not.toHaveBeenCalled();
});

test('a name someone else has never starts lift-off, and says so', async () => {
  mockGame.nameIsFree.mockResolvedValueOnce(false);
  await act(async () => { view = create(<OnboardingProvider><NameScreen /></OnboardingProvider>); });
  await act(async () => checkbox().props.onPress());
  await enter('Roda');
  await act(async () => button('Let’s play!').props.onPress());
  expect(mockGame.nameIsFree).toHaveBeenCalledWith('Roda');
  expect(shows('Someone already has this name. Try another, or add a number')).toBe(true);
  expect(button('Let’s play!').props.muted).toBe(true);
  expect(view.root.findAllByType(LiftOff)).toHaveLength(0);
  // Another name clears it
  await enter('Roda7');
  expect(button('Let’s play!').props.muted).toBe(false);
});

test('legal tabs preserve draft and consent; completion waits for lift-off', async () => {
  await act(async () => { view = create(<OnboardingProvider><NameScreen /></OnboardingProvider>); });
  await enter('BraveOtter');
  await act(async () => checkbox().props.onPress());
  const link = view.root.findAllByType(Text).find(node => node.props.accessibilityRole === 'link' && node.props.children === 'Terms of use')!;
  await act(async () => link.props.onPress());
  const privacy = view.root.findAll(node => node.props.accessibilityRole === 'tab' && node.findAllByType(Text).some(t => t.props.children === 'Privacy policy'))[0];
  await act(async () => privacy.props.onPress());
  expect(shows('1. Who we are')).toBe(true);
  await act(async () => button('Got it').props.onPress());
  expect(view.root.findByType(TextInput).props.value).toBe('BraveOtter');
  expect(checkbox().props.accessibilityState.checked).toBe(true);
  expect(button('Let’s play!').props.muted).toBe(false);
  await act(async () => button('Let’s play!').props.onPress());
  expect(mockGame.completeOnboarding).not.toHaveBeenCalled();
  await act(async () => view.root.findByType(LiftOff).props.onDone());
  expect(mockGame.completeOnboarding).toHaveBeenCalledWith('BraveOtter', 'coco');
});

test('existing players only consent and return to their game without lift-off or name editing', async () => {
  mockGame.state = { ...mockGame.state, onboardingCompleted: true, characterId: 'ember' };
  await act(async () => { view = create(<OnboardingProvider><NameScreen /></OnboardingProvider>); });
  expect(view.root.findAllByType(TextInput)).toHaveLength(0);
  await act(async () => checkbox().props.onPress());
  await act(async () => button('Let’s play!').props.onPress());
  expect(mockGame.completeOnboarding).toHaveBeenCalledWith('SunnyOtter', 'ember');
  expect(view.root.findAllByType(LiftOff)).toHaveLength(0);
});
