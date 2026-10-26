/*
 * The live room before a match: waiting in matchmaking (QueueView), or a
 * friends' lobby (LobbyView: its code, the mode, who's in and ready, invite
 * friends, start). Everything here is what the server last said; buttons
 * send, and the screen changes when the server answers.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LobbyView } from '../../../server/src/versus-contract';
import { MODE_IDS, MODES } from '../../../server/src/versus-contract';
import { sound } from '../../audio';
import { Character } from '../../characters/rig';
import { useTranslation } from '../../i18n';
import { useFriends, useVersus } from '../../state/VersusContext';
import { colors, fonts } from '../../theme';
import { GameScene, useSceneRange } from '../GameScene';
import { checkXml, closeXml, crownXml, Icon } from '../icons';
import { Raised } from '../Raised';
import { Tile } from '../RoundParts';
import { display, displayName, Face, formatClock, Label, MODE_LOOK, ModeChip, ModeIcon, modeName, modeTagline, PillButton, Sheet, useSecondsSince, versusStyles } from './parts';

export function QueueView({ character }: { character: Character }) {
  const t = useTranslation();
  const sceneRange = useSceneRange(220, 300);
  const { state, actions } = useVersus();
  const queue = state.queue!;
  const waited = useSecondsSince(queue.since);
  return (
    <View style={styles.fill}>
      <GameScene character={character} stage={0} gone={0} mode="play" style={[styles.scene, sceneRange]} />
      <View style={styles.queueText}>
        <ModeChip mode={queue.mode} />
        <Text style={[versusStyles.title, versusStyles.center]} accessibilityLiveRegion="polite">{t('versus.queue.title')}</Text>
        <Text style={[versusStyles.body, versusStyles.center]}>{modeTagline(t, queue.mode)}</Text>
        <Text style={styles.waited}>{formatClock(waited)}</Text>
        <Text style={[versusStyles.body, versusStyles.center, styles.hint]}>{t('versus.queue.hint')}</Text>
      </View>
      <PillButton label={t('versus.cancel')} onPress={actions.unqueue} ghost cue="back" style={styles.bottom} />
    </View>
  );
}

export function LobbyRoom({ lobby }: { lobby: LobbyView }) {
  const t = useTranslation();
  const { state, actions } = useVersus();
  const [inviting, setInviting] = useState(false);
  const me = state.me;
  const host = lobby.hostId === me;
  const mine = lobby.members.find((m) => m.id === me);
  const { minPlayers, maxPlayers } = MODES[lobby.mode];
  const missing = Math.max(0, minPlayers - lobby.members.length);
  const allReady = lobby.members.every((m) => m.ready);
  const look = MODE_LOOK[lobby.mode];

  // The code, mode and players scroll on a short phone; the buttons stay pinned under them
  return (
    <View style={styles.fill}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.lobbyScroll} showsVerticalScrollIndicator={false}>
        <Raised depth={4} shadowColor={colors.shadow} radius={22} style={[versusStyles.card, styles.codeCard]}>
          <Label>{t('versus.lobby.code')}</Label>
          <View style={styles.codeTiles} accessible accessibilityLabel={`${t('versus.lobby.code')}: ${lobby.code.split('').join(' ')}`}>
            {lobby.code.split('').map((c, i) => (
              <Tile key={i} letter={c} look="ok" w={38} h={44} sparkle={false} />
            ))}
          </View>
          <Text style={[versusStyles.body, versusStyles.center]}>{t('versus.lobby.codeHint')}</Text>
        </Raised>

        <Label>{t('versus.lobby.mode')}</Label>
        <View style={styles.modes}>
          {MODE_IDS.map((mode) => {
            const on = mode === lobby.mode;
            const fits = lobby.members.length <= MODES[mode].maxPlayers;
            return (
              <Pressable
                key={mode}
                disabled={!host || on || !fits}
                onPress={() => { sound.play('choose'); actions.setMode(mode); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !host || !fits }}
                style={[styles.mode, on && { backgroundColor: MODE_LOOK[mode].light, borderColor: MODE_LOOK[mode].main }, !on && (!host || !fits) && styles.modeOff]}
              >
                <ModeIcon mode={mode} size={22} />
                <Text style={[styles.modeText, on && { color: MODE_LOOK[mode].dark }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{modeName(t, mode)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Label>{t('versus.lobby.players', { count: lobby.members.length, max: maxPlayers })}</Label>
        <View style={styles.members}>
          {lobby.members.map((m) => (
            <View key={m.id} style={[styles.member, m.id === me && styles.memberMe]}>
              <Face characterId={m.characterId} size={36} />
              <View style={styles.memberText}>
                <View style={styles.memberName}>
                  <Text style={styles.memberNameText} numberOfLines={1}>{displayName(t, m.name)}</Text>
                  {m.id === lobby.hostId && <Icon xml={crownXml()} size={18} height={14} />}
                </View>
                <Text style={styles.memberSub}>{t('versus.lobby.rating', { rating: m.rating })}</Text>
              </View>
              <View style={[styles.ready, m.ready && styles.readyOn]}>
                {m.ready && <Icon xml={checkXml} size={13} />}
                <Text style={[styles.readyText, m.ready && styles.readyTextOn]}>{m.ready ? t('versus.lobby.ready') : t('versus.lobby.notReady')}</Text>
              </View>
              {host && m.id !== me && (
                <Pressable
                  onPress={() => { sound.play('tap'); actions.kick(m.id); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('versus.lobby.kick', { name: displayName(t, m.name) })}
                >
                  <Icon xml={closeXml(colors.muted)} size={18} />
                </Pressable>
              )}
            </View>
          ))}
          {Array.from({ length: maxPlayers - lobby.members.length }, (_, i) => (
            <View key={`empty${i}`} style={styles.empty}>
              <Text style={styles.emptyText}>{t('versus.lobby.empty')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        {lobby.playing ? (
          <Text style={[versusStyles.body, versusStyles.center]}>{t('versus.lobby.playing')}</Text>
        ) : (
          <>
            {lobby.members.length < maxPlayers && (
              <PillButton label={t('versus.lobby.invite')} onPress={() => setInviting(true)} ghost cue="panel-open" shadow={look.dark} />
            )}
            <View style={{ height: 10 }} />
            {host ? (
              <PillButton
                label={missing ? t('versus.lobby.needPlayers', { count: missing }) : allReady ? t('versus.lobby.start') : t('versus.lobby.waitReady')}
                onPress={actions.start}
                disabled={!!missing || !allReady}
                color={look.main}
                shadow={look.dark}
              />
            ) : (
              <PillButton
                label={mine?.ready ? t('versus.lobby.unready') : t('versus.lobby.imReady')}
                onPress={() => actions.ready(!mine?.ready)}
                ghost={!!mine?.ready}
                color={look.main}
                shadow={look.dark}
                cue={mine?.ready ? 'tap' : 'latch'}
              />
            )}
          </>
        )}
      </View>
      {/* Closes by itself once the lobby is full: nobody left to invite, and Start is underneath */}
      <InviteSheet visible={inviting && lobby.members.length < maxPlayers && !lobby.playing} onClose={() => setInviting(false)} lobby={lobby} />
    </View>
  );
}

function InviteSheet({ visible, onClose, lobby }: { visible: boolean; onClose: () => void; lobby: LobbyView }) {
  const t = useTranslation();
  const { actions } = useVersus();
  const { friends } = useFriends();
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set());
  const inLobby = new Set(lobby.members.map((m) => m.id));
  const online = friends.filter((f) => f.presence !== 'offline' && !inLobby.has(f.id));
  return (
    <Sheet visible={visible} onClose={onClose} title={t('versus.lobby.inviteTitle')}>
      {online.length ? (
        online.map((f) => {
          const sent = invited.has(f.id);
          const busy = f.presence === 'playing';
          return (
            <View key={f.id} style={styles.friend}>
              <Face characterId={f.characterId} size={34} />
              <View style={styles.memberText}>
                <Text style={styles.memberNameText} numberOfLines={1}>{displayName(t, f.name)}</Text>
                <Text style={styles.memberSub}>{busy ? t('friends.playing') : t('friends.online')}</Text>
              </View>
              <PillButton
                small
                label={sent ? t('friends.invited') : t('friends.invite')}
                disabled={sent || busy}
                onPress={() => {
                  actions.invite(f.id);
                  setInvited((s) => new Set(s).add(f.id));
                }}
                cue="link"
              />
            </View>
          );
        })
      ) : (
        <Text style={[versusStyles.body, versusStyles.center]}>{t('versus.lobby.noFriendsOnline')}</Text>
      )}
      <PillButton
        label={t('versus.lobby.addFriends')}
        ghost
        cue="panel-open"
        onPress={() => {
          onClose();
          router.push('/friends');
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scene: { flexGrow: 1, flexShrink: 1 },
  queueText: { alignItems: 'center', gap: 6, marginTop: 16 },
  waited: { ...display('700', 34, colors.coral), marginTop: 6 },
  hint: { marginTop: 4, fontSize: 13 },
  bottom: { marginTop: 'auto', paddingTop: 12, paddingBottom: 6 },
  lobbyScroll: { paddingBottom: 4 },

  codeCard: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  codeTiles: { flexDirection: 'row', gap: 6, marginVertical: 4 },

  modes: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 4 },
  modeOff: { opacity: 0.55 },
  modeText: { ...display('600', 13), textAlign: 'center' },

  members: { gap: 8 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: colors.line, paddingVertical: 7, paddingHorizontal: 10 },
  memberMe: { borderColor: colors.coral },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberNameText: { ...display('600', 16.5), flexShrink: 1 },
  memberSub: { fontFamily: fonts.body700, fontSize: 12.5, color: colors.muted },
  ready: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 11, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.keyUsed },
  readyOn: { backgroundColor: colors.mint },
  readyText: display('600', 12.5, colors.muted),
  readyTextOn: { color: '#fff' },
  empty: { borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: '#e6d1b8', paddingVertical: 15, alignItems: 'center' },
  emptyText: display('600', 14, '#c9b5a4'),

  friend: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: colors.line, paddingVertical: 6, paddingHorizontal: 8 },
});
