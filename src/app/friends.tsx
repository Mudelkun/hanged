/*
 * Friends (Versus): share your invite link with people who don't play yet,
 * find players by name, send and answer friend requests, see who's online,
 * invite them to your lobby, and remove, block or report someone. Pushed from the Versus tab and from a lobby's invite sheet.
 * Every change goes to the server (REST) and the lists come back fresh; the
 * server pushes `friends` when someone else changes them.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlayerCard, Relation, ReportReason, SearchResponse } from '../../server/src/versus-contract';
import { VERSUS_LIMITS } from '../../server/src/versus-contract';
import { Column } from '../components/Column';
import { BackHeader } from '../components/GameHeader';
import { BoardNote } from '../components/Leaderboard';
import { PaperBackground } from '../components/PaperBackground';
import { FriendRow } from '../components/versus/Friends';
import { InviteShareCard } from '../components/versus/InviteLink';
import { Label, PillButton, Sheet, VersusToast, versusStyles } from '../components/versus/parts';
import { useTranslation } from '../i18n';
import { useFriends, useLiveWhileFocused, useVersus } from '../state/VersusContext';
import { colors, fonts } from '../theme';
import { useLayout } from '../theme/layout';

const SEARCH_DELAY_MS = 300;

export default function FriendsScreen() {
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { column, gutter } = useLayout();
  const { state, actions } = useVersus();
  const f = useFriends();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse['players'] | null>(null);
  const [menu, setMenu] = useState<PlayerCard | null>(null);
  const [reporting, setReporting] = useState<PlayerCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set());
  useLiveWhileFocused();

  const searching = query.trim().length >= VERSUS_LIMITS.searchMin;
  const { search, data: lists } = f;
  // Searched again when the lists change, so a result's "Add" turns into "Pending"
  useEffect(() => {
    if (!searching) return;
    let live = true;
    const id = setTimeout(async () => {
      const found = await search(query.trim());
      if (live) setResults(found);
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, searching, search, lists]);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3_000);
    return () => clearTimeout(id);
  }, [message]);

  /** Runs a change and says how it went. */
  const run = async (change: Promise<boolean>, success?: string) => {
    const ok = await change;
    setMessage(ok ? (success ?? null) : t('friends.failed'));
  };

  const lobbyOpen = !!state.lobby && !state.lobby.playing;
  const relationButton = (p: PlayerCard & { relation: Relation }) => {
    switch (p.relation) {
      case 'none':
        return <PillButton small label={t('friends.add')} cue="link" onPress={() => run(f.request(p.id), t('friends.added'))} />;
      case 'incoming':
        return <PillButton small label={t('friends.accept')} cue="unlock" onPress={() => run(f.accept(p.id))} />;
      case 'outgoing':
        return <Text style={styles.tag}>{t('friends.pending')}</Text>;
      case 'friend':
        return <Text style={styles.tag}>{t('friends.isFriend')}</Text>;
    }
  };

  const data = f.data;
  return (
    <View style={styles.screen}>
      <PaperBackground />
      <Column fill={false}>
        <View style={{ height: insets.top }} />
        <BackHeader title={t('friends.title')} />
      </Column>
      <ScrollView
        contentContainerStyle={[styles.body, { width: column, paddingHorizontal: gutter, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!searching && <InviteShareCard onResult={setMessage} />}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('friends.search')}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          clearButtonMode="while-editing"
          maxLength={40}
          returnKeyType="search"
          accessibilityLabel={t('friends.search')}
          style={styles.search}
        />
        {query.trim() && !searching ? <Text style={styles.hint}>{t('friends.searchHint', { min: VERSUS_LIMITS.searchMin })}</Text> : null}

        {searching ? (
          results === null ? (
            <Text style={styles.hint}>{t('versus.loading')}</Text>
          ) : results.length === 0 ? (
            <Text style={styles.hint}>{t('friends.noResults')}</Text>
          ) : (
            <View style={styles.list}>
              {results.map((p) => (
                <FriendRow key={p.id} player={p} right={relationButton(p)} />
              ))}
            </View>
          )
        ) : !data ? (
          f.failed ? (
            <BoardNote title={t('versus.offline.title')} body={t('friends.offlineBody')} action={t('versus.retry')} onAction={f.reload} />
          ) : (
            <BoardNote body={t('versus.loading')} />
          )
        ) : (
          <>
            {data.incoming.length > 0 && (
              <>
                <Label>{t('friends.requests')}</Label>
                <View style={styles.list}>
                  {data.incoming.map((p) => (
                    <FriendRow
                      key={p.id}
                      player={p}
                      right={
                        <View style={styles.pair}>
                          <PillButton small label={t('friends.accept')} cue="unlock" onPress={() => run(f.accept(p.id))} />
                          <PillButton small ghost label={t('friends.decline')} cue="tap" onPress={() => run(f.dropRequest(p.id))} />
                        </View>
                      }
                    />
                  ))}
                </View>
              </>
            )}
            <Label>{t('friends.list', { count: f.friends.length })}</Label>
            {f.friends.length === 0 ? (
              <Text style={[versusStyles.body, styles.empty]}>{t('friends.empty')}</Text>
            ) : (
              <View style={styles.list}>
                {f.friends.map((p) => (
                  <FriendRow
                    key={p.id}
                    player={p}
                    presence={p.presence}
                    onMore={() => setMenu(p)}
                    right={
                      lobbyOpen && p.presence === 'online' ? (
                        <PillButton
                          small
                          label={invited.has(p.id) ? t('friends.invited') : t('friends.invite')}
                          disabled={invited.has(p.id)}
                          cue="link"
                          onPress={() => {
                            actions.invite(p.id);
                            setInvited((s) => new Set(s).add(p.id));
                          }}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </View>
            )}
            {data.outgoing.length > 0 && (
              <>
                <Label>{t('friends.sent')}</Label>
                <View style={styles.list}>
                  {data.outgoing.map((p) => (
                    <FriendRow key={p.id} player={p} right={<PillButton small ghost label={t('versus.cancel')} cue="tap" onPress={() => run(f.dropRequest(p.id))} />} />
                  ))}
                </View>
              </>
            )}
            {data.blocked.length > 0 && (
              <>
                <Label>{t('friends.blocked')}</Label>
                <View style={styles.list}>
                  {data.blocked.map((p) => (
                    <FriendRow key={p.id} player={p} right={<PillButton small ghost label={t('friends.unblock')} cue="tap" onPress={() => run(f.unblock(p.id))} />} />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? t('player.defaultName')}>
        <PillButton ghost label={t('friends.menu.remove')} cue="tap" onPress={() => { const p = menu!; setMenu(null); run(f.remove(p.id)); }} />
        <PillButton ghost label={t('friends.menu.block')} cue="tap" onPress={() => { const p = menu!; setMenu(null); run(f.block(p.id), t('friends.blockedDone')); }} />
        <PillButton ghost label={t('friends.menu.report')} cue="tap" onPress={() => { setReporting(menu); setMenu(null); }} />
        <PillButton label={t('versus.close')} cue="panel-close" onPress={() => setMenu(null)} />
      </Sheet>
      <Sheet visible={!!reporting} onClose={() => setReporting(null)} title={t('friends.report.title', { name: reporting?.name ?? t('player.defaultName') })}>
        {(['name', 'cheating', 'other'] as ReportReason[]).map((reason) => (
          <PillButton
            key={reason}
            ghost
            label={t(`friends.report.${reason}`)}
            cue="tap"
            onPress={() => {
              const p = reporting!;
              setReporting(null);
              run(f.report(p.id, reason), t('friends.reported'));
            }}
          />
        ))}
        <PillButton label={t('versus.cancel')} cue="panel-close" onPress={() => setReporting(null)} />
      </Sheet>
      {!!message && (
        <View pointerEvents="none" style={[styles.message, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}
      <VersusToast bottom={insets.bottom + 70} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  // Centred on a tablet; the scroll view itself spans the screen, so the sides scroll too
  body: { alignSelf: 'center', paddingTop: 4 },
  search: {
    fontFamily: fonts.body800,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  hint: { fontFamily: fonts.body700, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 14 },
  list: { gap: 8 },
  pair: { flexDirection: 'row', gap: 6 },
  tag: { fontFamily: fonts.display600, fontSize: 13.5, color: colors.muted },
  empty: { textAlign: 'center', marginTop: 6, marginHorizontal: 12 },
  message: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  messageText: { fontFamily: fonts.display600, fontSize: 15, color: '#fff', backgroundColor: colors.mintD, borderRadius: 16, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 9, textAlign: 'center' },
});
