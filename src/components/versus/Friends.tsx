/*
 * A player's row in the friends screen (face, name, presence, an action on
 * the right, and a "more" menu), and the invite banner that a friend's
 * invite shows over any screen.
 */
import { usePathname } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlayerCard, Presence } from '../../../server/src/versus-contract';
import { sound } from '../../audio';
import { useTranslation } from '../../i18n';
import { useVersus } from '../../state/VersusContext';
import { colors, fonts } from '../../theme';
import { closeXml, Icon, moreXml } from '../icons';
import { Raised } from '../Raised';
import { display, displayName, Face, MODE_LOOK, ModeIcon, modeName, PillButton } from './parts';

const PRESENCE_COLOR: Record<Presence, string> = { online: colors.mint, playing: colors.butterD, offline: colors.tabIdle };

export function FriendRow({ player, presence, right, onMore }: { player: PlayerCard; presence?: Presence; right?: ReactNode; onMore?: () => void }) {
  const t = useTranslation();
  const name = displayName(t, player.name);
  return (
    <View style={styles.row}>
      <View>
        <Face characterId={player.characterId} size={38} />
        {presence && <View style={[styles.dot, { backgroundColor: PRESENCE_COLOR[presence] }]} />}
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {presence && <Text style={styles.presence}>{t(`friends.${presence}`)}</Text>}
      </View>
      {right}
      {onMore && (
        <Pressable
          onPress={() => { sound.play('panel-open'); onMore(); }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('friends.a11y.menu', { name })}
          style={({ pressed }) => [styles.more, pressed && { opacity: 0.5 }]}
        >
          <Icon xml={moreXml()} size={22} />
        </Pressable>
      )}
    </View>
  );
}

/** A friend's invite, over any screen but a match. Join opens their lobby. */
export function InviteBanner() {
  const t = useTranslation();
  const { state, actions } = useVersus();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const invite = state.invites.at(-1);
  if (!invite || state.match || pathname === '/onboarding' || pathname.startsWith('/onboarding/')) return null;
  const look = MODE_LOOK[invite.mode];
  return (
    <View style={[styles.banner, { top: insets.top + 6 }]} accessibilityLiveRegion="polite">
      <Raised depth={5} shadowColor={look.dark} radius={22} style={[styles.card, { borderColor: look.light }]}>
        <Face characterId={invite.from.characterId} size={40} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>{t('versus.invite.title', { name: displayName(t, invite.from.name) })}</Text>
          <View style={styles.mode}>
            <ModeIcon mode={invite.mode} size={15} />
            <Text style={[styles.modeText, { color: look.dark }]} numberOfLines={1}>{modeName(t, invite.mode)}</Text>
          </View>
        </View>
        <PillButton small label={t('versus.invite.join')} color={look.main} shadow={look.dark} cue="primary" onPress={() => actions.answer(invite.lobbyId, true)} />
        <Pressable
          onPress={() => { sound.play('panel-close'); actions.answer(invite.lobbyId, false); }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('versus.invite.decline')}
        >
          <Icon xml={closeXml(colors.muted)} size={18} />
        </Pressable>
      </Raised>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: colors.line, paddingVertical: 7, paddingLeft: 8, paddingRight: 10 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#fff' },
  text: { flex: 1, minWidth: 0 },
  name: display('600', 16.5),
  presence: { fontFamily: fonts.body700, fontSize: 12.5, color: colors.muted },
  more: { paddingHorizontal: 2 },

  banner: { position: 'absolute', left: 12, right: 12, zIndex: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 2, paddingVertical: 8, paddingLeft: 8, paddingRight: 12 },
  title: display('700', 16),
  mode: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  modeText: { fontFamily: fonts.body800, fontSize: 12.5 },
});
