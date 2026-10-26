/*
 * The live room: whatever the player is in right now, as the server says:
 * a match's result, the match, the friends' lobby, or the matchmaking queue
 * (src/components/versus/). It opens by itself when the server puts the
 * player in one (VersusRouter, src/app/_layout.tsx) and closes when they're
 * out of all of them. No swipe back: leaving a match is a decision (a forfeit).
 */
import { router, useIsFocused } from 'expo-router';
import { ReactNode, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMatchMusic } from '../audio/AudioProvider';
import { characterById } from '../characters/rig';
import { Column } from '../components/Column';
import { BackHeader } from '../components/GameHeader';
import { PaperBackground } from '../components/PaperBackground';
import { MatchPlay } from '../components/versus/MatchPlay';
import { MatchResult } from '../components/versus/MatchResult';
import { display, VersusToast } from '../components/versus/parts';
import { LobbyRoom, QueueView } from '../components/versus/Room';
import { useTranslation } from '../i18n';
import { useGame } from '../state/GameContext';
import { inRoom } from '../state/versus';
import { useLiveWhileFocused, useVersus } from '../state/VersusContext';
import { colors } from '../theme';
import { useLayout } from '../theme/layout';

export default function MatchScreen() {
  const t = useTranslation();
  const { state: game } = useGame();
  const { state, actions } = useVersus();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const focused = useIsFocused();
  const character = characterById(game.characterId);
  useLiveWhileFocused();
  // The match plays its mode's loop from the countdown; lobby, queue and result keep the solo playlist.
  useMatchMusic(focused && state.match && !state.result ? state.match.mode : undefined);

  const empty = !inRoom(state);
  useEffect(() => {
    if (empty && focused) {
      if (router.canGoBack()) router.back();
      else router.replace('/versus');
    }
  }, [empty, focused]);

  let body: ReactNode = null;
  let header: ReactNode = null;
  if (state.result) body = <MatchResult result={state.result} character={character} />;
  else if (state.match) body = <MatchPlay match={state.match} character={character} />;
  else if (state.lobby) {
    header = <BackHeader title={t('versus.lobby.title')} onBack={actions.leaveLobby} />;
    body = <LobbyRoom lobby={state.lobby} />;
  } else if (state.queue) body = <QueueView character={character} />;

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <Column>
        <View style={{ height: insets.top }} />
        {header}
        <View style={[styles.body, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 10) }]}>
          {body}
          {state.conn !== 'online' && !state.match && body && <Text style={styles.reconnecting}>{t('versus.reconnecting')}</Text>}
        </View>
      </Column>
      <VersusToast bottom={insets.bottom + 90} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, minHeight: 0 },
  reconnecting: { ...display('600', 13, colors.coralD), textAlign: 'center', marginTop: 6 },
});
