import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { characterById } from '../../characters/rig';
import { GameScene } from '../../components/GameScene';
import { ListGroup, Toggle } from '../../components/Profile';
import { balloonSounds } from '../scenes';

const mockAudio = { play: jest.fn(), voice: jest.fn(), sequence: jest.fn(() => () => {}), cancel: jest.fn() };
jest.mock('../AudioProvider', () => ({ useSoundScope: () => mockAudio }));
jest.mock('../index', () => ({ sound: { play: jest.fn(), unlock: jest.fn() } }));
jest.mock('expo-router', () => ({ useIsFocused: () => true, useFocusEffect: jest.fn(), router: {} }));

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('restored balloon/result stages are quiet; the last actual miss uses that character and the rig timing', async () => {
  let view!: ReactTestRenderer;
  const character = characterById('ribbit');
  await act(async () => { view = create(<GameScene character={character} stage={9} gone={9} mode="play" />); });
  expect(mockAudio.sequence).not.toHaveBeenCalled();
  await act(async () => { view.update(<GameScene character={character} stage={10} gone={10} mode="play" />); });
  expect(mockAudio.sequence).toHaveBeenCalledTimes(1);
  expect(mockAudio.sequence).toHaveBeenCalledWith(balloonSounds(true, 2200, 'ribbit', false));
  await act(async () => { view.update(<GameScene character={characterById('bun')} stage={10} gone={10} mode="lost" />); });
  expect(mockAudio.sequence).toHaveBeenCalledTimes(1);
  await act(async () => view.unmount());
  await act(async () => { view = create(<GameScene character={character} stage={10} gone={10} mode="lost" />); });
  expect(mockAudio.sequence).toHaveBeenCalledTimes(1);
  await act(async () => view.unmount());
});

test('profile exposes two independently controlled, accessible audio switches', async () => {
  const effects = jest.fn(), music = jest.fn(); let view!: ReactTestRenderer;
  await act(async () => { view = create(<ListGroup title="Settings" items={[
    { key: 'fx', icon: '<svg/>', color: '#abc', label: 'Sound effects & voices', toggle: { value: false, onChange: effects } },
    { key: 'music', icon: '<svg/>', color: '#abc', label: 'Music', toggle: { value: true, onChange: music } },
  ]} />); });
  const switches = view.root.findAllByType(Toggle);
  expect(switches).toHaveLength(2);
  expect(switches[0].props.value).toBe(false); expect(switches[1].props.value).toBe(true);
  expect(switches[0].props.accessibilityLabel).toBe('Sound effects & voices');
  await act(async () => switches[0].props.onValueChange(true));
  expect(effects).toHaveBeenCalledWith(true); expect(music).not.toHaveBeenCalled();
  await act(async () => switches[1].props.onValueChange(false));
  expect(music).toHaveBeenCalledWith(false);
  await act(async () => view.unmount());
});
