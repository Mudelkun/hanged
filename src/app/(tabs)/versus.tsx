/*
 * The Versus tab: online matches against friends or random players
 * (Context/versus.md). Pick a mode, then a quick match (matchmaking) or a
 * lobby for friends; join a friend's lobby with its code; manage friends.
 * When the server confirms, the live room (src/app/match.tsx) opens by
 * itself. Offline, off (the admin switch), or an app too old: a note says so,
 * and the solo game is untouched.
 */
import { router, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MODE_IDS } from '../../../server/src/versus-contract';
import { characterById } from '../../characters/rig';
import { TitleHeader } from '../../components/GameHeader';
import { BoardNote } from '../../components/Leaderboard';
import { Column } from '../../components/Column';
import { PaperBackground } from '../../components/PaperBackground';
import { TabBar } from '../../components/TabBar';
import { CodeSheet, ModeCard, SocialRow, StatsStrip, VersusNote } from '../../components/versus/Hub';
import { useTranslation } from '../../i18n';
import { LIVE_URL } from '../../net/api';
import { useGame } from '../../state/GameContext';
import { useFriends, useLiveWhileFocused, useVersus } from '../../state/VersusContext';
import { colors } from '../../theme';
import { useLayout } from '../../theme/layout';

export default function VersusScreen() {
  const t = useTranslation();
  const { state: game } = useGame();
  const { state, actions, refreshStatus } = useVersus();
  const { data: friends } = useFriends();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const character = characterById(game.characterId);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  useLiveWhileFocused();

  const check = useCallback(() => {
    refreshStatus().then(setReachable);
  }, [refreshStatus]);
  useFocusEffect(check);

  const off = state.status?.enabled === false;
  const online = state.conn === 'online';
  let note: ReactNode = null;
  if (!LIVE_URL || (reachable === false && !online)) {
    note = <VersusNote character={character} title={t('versus.offline.title')} body={t('versus.offline.body')} action={t('versus.retry')} onAction={check} />;
  } else if (off) {
    note = <VersusNote character={character} title={t('versus.off.title')} body={t('versus.off.body')} message={state.status?.message} action={t('versus.checkAgain')} onAction={check} />;
  } else if (state.closed === 'version') {
    note = <VersusNote character={character} title={t('versus.update.title')} body={t('versus.update.body')} />;
  } else if (state.closed === 'elsewhere') {
    note = <VersusNote character={character} title={t('versus.elsewhere.title')} body={t('versus.elsewhere.body')} action={t('versus.elsewhere.action')} onAction={check} />;
  } else if (!online) {
    note = <BoardNote body={state.conn === 'offline' ? t('versus.reconnecting') : t('versus.connecting')} />;
  }

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <Column>
        <View style={{ height: insets.top }} />
        <TitleHeader title={t('versus.title')} character={character} tokens={game.tokens} />
        <ScrollView contentContainerStyle={[styles.body, { paddingHorizontal: gutter }]} showsVerticalScrollIndicator={false}>
          {note ?? (
            <>
              {state.stats && <StatsStrip stats={state.stats} />}
              {MODE_IDS.map((mode) => (
                <ModeCard key={mode} mode={mode} onQuick={() => actions.queue(mode)} onFriends={() => actions.host(mode)} />
              ))}
              <SocialRow requests={friends?.incoming.length ?? 0} onCode={() => setCodeOpen(true)} onFriends={() => router.push('/friends')} />
            </>
          )}
        </ScrollView>
        <TabBar active="versus" />
      </Column>
      <CodeSheet
        visible={codeOpen}
        onClose={() => setCodeOpen(false)}
        onJoin={(code) => {
          setCodeOpen(false);
          actions.join(code);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { paddingTop: 4, paddingBottom: 24 },
});
