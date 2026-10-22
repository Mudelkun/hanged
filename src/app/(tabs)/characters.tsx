/*
 * The Characters page (mockup: Characters): look through every character on
 * the stage, then unlock a locked one with tokens or pick one already owned.
 * Everything happens on the device (progress.ts: buyCharacter,
 * selectCharacter), so it works offline. Buying a character also picks it,
 * and the pick shows at once everywhere the character appears.
 */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { characterById } from '../../characters/rig';
import { useSoundScope } from '../../audio/AudioProvider';
import { CharacterGrid, CharacterInfo, Cheer, Ownership, SHOP, Showcase } from '../../components/CharacterShop';
import { TitleHeader } from '../../components/GameHeader';
import { PaperBackground } from '../../components/PaperBackground';
import { PayButton, useRefusal } from '../../components/PayButton';
import { BigButton } from '../../components/RoundParts';
import { TabBar } from '../../components/TabBar';
import { feedback } from '../../feedback';
import { canBuyCharacter, characterPrice, ownsCharacter } from '../../game/progress';
import { t } from '../../i18n';
import { useGame } from '../../state/GameContext';
import { colors } from '../../theme';

const GUTTER = 16;

export default function CharactersScreen() {
  const audio = useSoundScope();
  const { state, dispatch } = useGame();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = height < 760;

  // The page opens on the character being played, and keeps what was looked at while it stays mounted
  const [viewedId, setViewedId] = useState(state.characterId);
  const [cheer, setCheer] = useState<Cheer>({ n: 0, big: false });
  const [refused, refuse] = useRefusal();
  const viewed = characterById(viewedId);
  const price = characterPrice(viewedId) ?? 0;

  const ownership = useCallback(
    (id: string): Ownership => (id === state.characterId ? 'playing' : ownsCharacter(state, id) ? 'owned' : 'locked'),
    [state],
  );
  const status = ownership(viewedId);

  const step = (by: number) => {
    const i = SHOP.findIndex((c) => c.id === viewedId);
    viewCharacter(SHOP[(i + by + SHOP.length) % SHOP.length].id);
  };
  const viewCharacter = (id: string) => {
    if (id === viewedId) return;
    audio.cancel();
    audio.play('browse');
    setViewedId(id);
  };

  const onBuy = () => {
    // The button already flew the price to the counter: pay, then celebrate
    if (!canBuyCharacter(state, viewedId)) return;
    dispatch({ type: 'buyCharacter', id: viewedId });
    feedback.characterUnlocked();
    audio.sequence([
      { cue: 'latch' }, { cue: 'unlock', at: 120 }, { cue: 'confetti', at: 150, gain: .8 },
      { voice: 'hello', character: viewedId, at: 240 }, { cue: 'ribbon', at: 480 },
    ]);
    setCheer((c) => ({ n: c.n + 1, big: true }));
  };
  const onRefuse = () => {
    feedback.refused();
    refuse();
  };
  const onPick = () => {
    dispatch({ type: 'selectCharacter', id: viewedId });
    feedback.characterPicked();
    audio.play('choose');
    audio.sequence([{ voice: 'hello', character: viewedId, at: 120 }]);
    setCheer((c) => ({ n: c.n + 1, big: false }));
  };

  const short = price - state.tokens;
  const note = refused && status === 'locked' && short > 0
    ? short === 1 ? t('chars.needMore.one') : t('chars.needMore.other', { count: short })
    : null;

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <View style={{ height: insets.top }} />
      <TitleHeader title={t('chars.title')} character={characterById(state.characterId)} tokens={state.tokens} live />
      <View style={styles.body}>
        <Showcase
          character={viewed}
          cheer={cheer}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          style={[styles.stage, { minHeight: compact ? 130 : 170 }]}
        />
        <CharacterInfo character={viewed} ownership={status} price={price} note={note} />
        <CharacterGrid ownership={ownership} viewedId={viewedId} width={width - GUTTER * 2} gutter={GUTTER} compact={compact} onPress={viewCharacter} />
        <View style={styles.action}>
          {status === 'locked' ? (
            <PayButton
              big
              label={t('chars.unlock', { name: viewed.name, price })}
              a11yLabel={t('chars.a11y.unlock', { name: viewed.name, price })}
              canAfford={state.tokens >= price}
              onPay={onBuy}
              onRefuse={onRefuse}
            />
          ) : status === 'owned' ? (
            <BigButton cue={false} label={t('chars.choose', { name: viewed.name })} onPress={onPick} />
          ) : (
            <BigButton ghost label={t('chars.play', { name: viewed.name })} onPress={() => router.navigate('/')} />
          )}
        </View>
      </View>
      <TabBar active="characters" compact={compact} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, paddingHorizontal: GUTTER, minHeight: 0 },
  // The mockup's stage is 222 tall; it grows on tall phones so the grid and button sit low, like Play's keyboard
  stage: { flexGrow: 1, flexShrink: 1, maxHeight: 300, marginTop: 4 },
  action: { marginTop: 'auto', paddingTop: 6 },
});
