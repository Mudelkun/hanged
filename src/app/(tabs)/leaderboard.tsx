/*
 * The Leaderboard: players ranked by words guessed, this week or all time
 * (server/src/leaderboard.ts). The only screen that needs the internet:
 * offline, it says so and the game plays on. The player's own entry shows
 * their local name and character, which may be newer than the server's copy;
 * outside the top it's pinned under the list.
 */
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Period } from '../../../server/src/contract';
import { characterById } from '../../characters/rig';
import { TitleHeader } from '../../components/GameHeader';
import { BoardNote, PeriodSwitch, Podium, Ranked, RankRow } from '../../components/Leaderboard';
import { PaperBackground } from '../../components/PaperBackground';
import { TabBar } from '../../components/TabBar';
import { GameState } from '../../game/progress';
import { Translator, useTranslation } from '../../i18n';
import { useGame } from '../../state/GameContext';
import { Board, useLeaderboard } from '../../state/useLeaderboard';
import { colors } from '../../theme';

const PODIUM = 3;

function rank(board: Board, s: GameState, t: Translator) {
  const name = (n: string | null) => n ?? t('player.defaultName');
  const all: Ranked[] = board.entries.map((e) => {
    const me = e.playerId === board.meId;
    return {
      rank: e.rank,
      name: name(me ? s.playerName : e.name),
      character: characterById(me ? s.characterId : e.characterId),
      words: e.words,
      me,
    };
  });
  const pinned: Ranked | null =
    board.me && !all.some((e) => e.me)
      ? { ...board.me, name: name(s.playerName), character: characterById(s.characterId), me: true }
      : null;
  return { top: all.slice(0, PODIUM), rest: all.slice(PODIUM), pinned };
}

export default function LeaderboardScreen() {
  const t = useTranslation();
  const { state } = useGame();
  const insets = useSafeAreaInsets();
  const compact = useWindowDimensions().height < 760;
  const [period, setPeriod] = useState<Period>('week');
  const { view, refreshing, refresh } = useLeaderboard(period);
  const board = view.status === 'ready' ? view.board : null;
  const ranked = useMemo(() => board && rank(board, state, t), [board, state, t]);

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <View style={{ height: insets.top }} />
      <TitleHeader title={t('board.title')} character={characterById(state.characterId)} tokens={state.tokens} />
      <View style={styles.body}>
        <PeriodSwitch period={period} onChange={setPeriod} />
        {ranked ? (
          <FlatList
            data={ranked.rest}
            keyExtractor={(e) => String(e.rank)}
            renderItem={({ item }) => <RankRow entry={item} />}
            ListHeaderComponent={
              ranked.top.length ? (
                <Podium top={ranked.top} />
              ) : (
                <BoardNote body={t(period === 'week' ? 'board.empty.week' : 'board.empty.all')} />
              )
            }
            ListFooterComponent={
              ranked.pinned ? (
                <View style={styles.pinned}>
                  <RankRow entry={ranked.pinned} />
                </View>
              ) : !board?.me && ranked.top.length ? (
                <BoardNote body={t('board.notRanked')} />
              ) : undefined
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.coral} />}
          />
        ) : view.status === 'offline' ? (
          <BoardNote
            title={t('board.offline.title')}
            body={t('board.offline.body')}
            action={refreshing ? t('board.loading') : t('board.retry')}
            onAction={refresh}
          />
        ) : (
          <BoardNote body={t('board.loading')} />
        )}
      </View>
      <TabBar active="leaderboard" compact={compact} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, paddingHorizontal: 16, minHeight: 0 },
  list: { paddingBottom: 8 },
  pinned: { marginTop: 4, paddingTop: 12, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.line },
});
