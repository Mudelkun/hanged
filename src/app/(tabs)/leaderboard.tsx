/*
 * The Leaderboard: players ranked by words guessed, this week or all time
 * (server/src/leaderboard.ts). The only screen that needs the internet:
 * offline, it says so and the game plays on. The player's own entry shows
 * their local name and character, which may be newer than the server's copy;
 * outside the top it's pinned under the list. While that row is off screen,
 * the Find-me pill scrolls to it.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, ListRenderItem, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Period } from '../../../server/src/contract';
import { characterById } from '../../characters/rig';
import { TitleHeader } from '../../components/GameHeader';
import { sound } from '../../audio';
import { BoardNote, FindMe, PeriodSwitch, Ranked, RankRow, rowSpan } from '../../components/Leaderboard';
import { PaperBackground } from '../../components/PaperBackground';
import { TabBar } from '../../components/TabBar';
import { GameState } from '../../game/progress';
import { Translator, useTranslation } from '../../i18n';
import { useGame } from '../../state/GameContext';
import { Board, useLeaderboard } from '../../state/useLeaderboard';
import { colors } from '../../theme';

const LIST_TOP = 4;
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

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
      ? { ...board.me, name: name(s.playerName), character: characterById(s.characterId), me: true, pinned: true }
      : null;
  const rows = pinned ? [...all, pinned] : all;
  // Each row's offset, for getItemLayout: rows have fixed heights
  const offsets: number[] = [];
  rows.reduce((at, e) => (offsets.push(at), at + rowSpan(e)), LIST_TOP);
  const meIndex = rows.findIndex((e) => e.me);
  return { rows, offsets, meIndex, me: rows[meIndex] };
}

const keyOf = (e: Ranked) => (e.pinned ? 'me' : String(e.rank));


export default function LeaderboardScreen() {
  const t = useTranslation();
  const { state } = useGame();
  const insets = useSafeAreaInsets();
  const compact = useWindowDimensions().height < 760;
  const [period, setPeriod] = useState<Period>('week');
  const { view, refreshing, refresh } = useLeaderboard(period);
  const board = view.status === 'ready' ? view.board : null;
  const ranked = useMemo(() => board && rank(board, state, t), [board, state, t]);

  const list = useRef<FlatList<Ranked>>(null);
  // The rows on screen, to tell where the player's own row is
  const [seen, setSeen] = useState<{ first: number; last: number } | null>(null);
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const at = viewableItems.map((v) => v.index ?? 0);
    const next = at.length ? { first: Math.min(...at), last: Math.max(...at) } : null;
    setSeen((prev) => (prev?.first === next?.first && prev?.last === next?.last ? prev : next));
  });
  const [flash, setFlash] = useState(0);
  const meIndex = ranked?.meIndex ?? -1;
  const meOff = meIndex >= 0 && !!seen && (meIndex < seen.first || meIndex > seen.last);

  const findMe = () => {
    sound.play('tap');
    list.current?.scrollToIndex({ index: meIndex, viewPosition: 0.5 });
    setFlash((f) => f + 1);
  };
  const renderItem = useCallback<ListRenderItem<Ranked>>(
    ({ item }) => <RankRow entry={item} flash={item.me ? flash : undefined} />,
    [flash],
  );
  const offsets = ranked?.offsets;
  const getItemLayout = useCallback(
    (data: ArrayLike<Ranked> | null | undefined, index: number) => ({
      length: data ? rowSpan(data[index]) : 0,
      offset: offsets?.[index] ?? 0,
      index,
    }),
    [offsets],
  );

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <View style={{ height: insets.top }} />
      <TitleHeader title={t('board.title')} character={characterById(state.characterId)} tokens={state.tokens} />
      <View style={styles.body}>
        <PeriodSwitch period={period} onChange={setPeriod} />
        {ranked ? (
          <View style={styles.board}>
            <FlatList
              ref={list}
              data={ranked.rows}
              keyExtractor={keyOf}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              onViewableItemsChanged={onViewable}
              viewabilityConfig={VIEWABILITY}
              ListEmptyComponent={<BoardNote body={t(period === 'week' ? 'board.empty.week' : 'board.empty.all')} />}
              ListFooterComponent={!board?.me && ranked.rows.length ? <BoardNote body={t('board.notRanked')} /> : undefined}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.coral} />}
            />
            {ranked.me && (
              <FindMe entry={ranked.me} visible={meOff} direction={seen && meIndex < seen.first ? 'up' : 'down'} onPress={findMe} />
            )}
          </View>
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
  board: { flex: 1, minHeight: 0 },
  // Room under the last row for the Find-me pill
  list: { paddingTop: LIST_TOP, paddingBottom: 72 },
});
