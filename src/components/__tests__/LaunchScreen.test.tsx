import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { sound } from '../../audio';
import { SPLASH } from '../../brand/brand';
import { feedback } from '../../feedback';
import { LaunchScreen } from '../LaunchScreen';

jest.mock('../../audio', () => ({ sound: { play: jest.fn() } }));
jest.mock('../../feedback', () => ({ feedback: { launch: jest.fn() } }));
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-svg', () => ({ SvgXml: () => null }));

let view: ReactTestRenderer;
const played = (cue: string) => (sound.play as jest.Mock).mock.calls.filter(([c]) => c === cue).length;
const launch = async (reduceMotion: boolean, onDone: () => void) => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  await act(async () => { view = create(<LaunchScreen characterId="coco" onDone={onDone} />); });
};
const advance = async (ms: number) => { for (let i = 0; i < ms; i += 16) await act(async () => { jest.advanceTimersByTime(16); }); };

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(async () => { await act(async () => view?.unmount()); jest.useRealTimers(); });

test('plays once: a tick per letter, a tap when solved, a rise on lift-off, then hands over to the app', async () => {
  const onDone = jest.fn();
  await launch(false, onDone);
  await advance(SPLASH.exit * 1000 - 100);
  expect(played('tile')).toBe(6);
  expect(feedback.launch).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();
  await advance((SPLASH.end - SPLASH.exit) * 1000 + 300);
  expect(played('level-rise')).toBe(1);
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('hides the native splash once its first frame (the same picture) is laid out', async () => {
  await launch(false, jest.fn());
  view.root.findAll(node => typeof node.props.onLayout === 'function')[0].props.onLayout();
  expect(SplashScreen.hideAsync).toHaveBeenCalled();
});

test('a tap skips to the lift-off, and the letters it jumped over stay quiet', async () => {
  const onDone = jest.fn();
  await launch(false, onDone);
  await advance(300);
  // Matched by props: the rendered node is not the exported Pressable (see localization.test)
  await act(async () => view.root.findAll(node => node.props.accessibilityHint && typeof node.props.onPress === 'function')[0].props.onPress());
  await advance((SPLASH.end - SPLASH.exit) * 1000 + 300);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(played('tile')).toBeLessThan(3);
  expect(played('level-rise')).toBe(1);
});

test('with Reduce Motion the word shows at once and the screen just fades', async () => {
  const onDone = jest.fn();
  await launch(true, onDone);
  await advance(1300);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(played('tile')).toBe(0);
});
