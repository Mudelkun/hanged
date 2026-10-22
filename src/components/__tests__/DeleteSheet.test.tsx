import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Modal, Text, TextInput } from 'react-native';
import { characterById } from '../../characters/rig';
import { t } from '../../i18n';
import { DeleteSheet } from '../Profile';
import { BigButton } from '../RoundParts';

const mockAudio = { play: jest.fn() };
jest.mock('../../audio/AudioProvider', () => ({ useSoundScope: () => mockAudio }));
jest.mock('../../audio', () => ({ sound: { play: jest.fn(), unlock: jest.fn() } }));
jest.mock('../../feedback', () => ({ feedback: { refused: jest.fn() } }));

let view: ReactTestRenderer;
const character = characterById('bun');
const input = () => view.root.findByType(TextInput);
const deleteButton = () => view.root.findAllByType(BigButton)[0];
const keepButton = () => view.root.findAllByType(BigButton)[1];

beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await act(async () => view?.unmount()); });

test('only exact uppercase DELETE enables deletion, including the confirmation handler', async () => {
  const onConfirm = jest.fn(async () => true);
  await act(async () => {
    view = create(<DeleteSheet visible character={character} onClose={jest.fn()} onConfirm={onConfirm} />);
  });

  for (const value of ['', 'delete', 'Delete', 'DELET', ' DELETE', 'DELETE ', 'DELETE MORE']) {
    await act(async () => input().props.onChangeText(value));
    const button = deleteButton();
    expect(button.props.disabled).toBe(true);
    expect(button.findByProps({ accessibilityRole: 'button' }).props.disabled).toBe(true);
    expect(button.findByProps({ accessibilityRole: 'button' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => button.props.onPress());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(mockAudio.play).not.toHaveBeenCalled();
  }

  await act(async () => input().props.onChangeText('DELETE'));
  expect(deleteButton().props.disabled).toBe(false);
  expect(input().props.onSubmitEditing).toBeUndefined();
  await act(async () => deleteButton().props.onPress());
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('pending deletion locks controls and an offline failure permits retry', async () => {
  let finish!: (done: boolean) => void;
  const onConfirm = jest.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const onClose = jest.fn();
  await act(async () => {
    view = create(<DeleteSheet visible character={character} onClose={onClose} onConfirm={onConfirm} />);
  });
  await act(async () => input().props.onChangeText('DELETE'));
  await act(async () => { void deleteButton().props.onPress(); });
  expect(deleteButton().props.disabled).toBe(true);
  expect(keepButton().props.disabled).toBe(true);
  expect(input().props.editable).toBe(false);
  await act(async () => {
    void deleteButton().props.onPress();
    view.root.findByType(Modal).props.onRequestClose();
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => finish(false));
  expect(view.root.findAllByType(Text).some(node => node.props.children === t('delete.offline'))).toBe(true);
  expect(input().props.editable).toBe(true);
  expect(deleteButton().props.disabled).toBe(false);
  await act(async () => { void deleteButton().props.onPress(); });
  expect(onConfirm).toHaveBeenCalledTimes(2);
  await act(async () => finish(true));
});

test.each(['keep', 'back', 'backdrop', 'hide'])('closing with %s clears confirmation before reopening', async closeWith => {
  const props = { character, onClose: jest.fn(), onConfirm: jest.fn(async () => true) };
  await act(async () => { view = create(<DeleteSheet {...props} visible />); });
  await act(async () => input().props.onChangeText('DELETE'));
  await act(async () => {
    if (closeWith === 'keep') keepButton().props.onPress();
    if (closeWith === 'back') view.root.findByType(Modal).props.onRequestClose();
    if (closeWith === 'backdrop') {
      view.root.findByProps({ accessibilityLabel: t('delete.keep') }).props.onPress();
    }
    view.update(<DeleteSheet {...props} visible={false} />);
  });
  await act(async () => view.update(<DeleteSheet {...props} visible />));
  expect(input().props.value).toBe('');
  expect(deleteButton().props.disabled).toBe(true);
  expect(props.onConfirm).not.toHaveBeenCalled();
});
