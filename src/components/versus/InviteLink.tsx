/*
 * Friend invite links on screen (src/state/useInviteLink.ts does the work):
 *  - InviteLinks: over any screen, the sheet that asks an existing player to
 *    accept a link they opened, and the banner that says how a link went;
 *  - InviteShareCard: the Friends screen's "share my link";
 *  - OnboardingInvite: onboarding's first screen. It shows who invited a new
 *    player, or, on iOS, offers to paste the link the invite page copied
 *    (Apple passes nothing through the App Store; the system Paste button
 *    reads the clipboard without a permission prompt).
 */
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlayerCard } from '../../../server/src/versus-contract';
import { sound } from '../../audio';
import { TranslationKey, useTranslation } from '../../i18n';
import { inviteCodeIn } from '../../invite/link';
import { receiveInvite } from '../../invite/pending';
import { api } from '../../net/api';
import { useInviteLink, usePendingInvite, useShareInvite } from '../../state/useInviteLink';
import type { FriendNote } from '../../state/versus';
import { useVersus } from '../../state/VersusContext';
import { colors, fonts } from '../../theme';
import { Raised } from '../Raised';
import { display, displayName, Face, PillButton, Sheet, versusStyles } from './parts';

const NOTE_TEXT: Record<Exclude<FriendNote['kind'], 'friends'>, TranslationKey> = {
  own: 'invite.note.own',
  gone: 'invite.note.gone',
  full: 'invite.note.full',
};

export function InviteLinks() {
  const t = useTranslation();
  const link = useInviteLink();
  const { state } = useVersus();
  const name = displayName(t, link.asking?.name ?? null);
  return (
    <>
      {/* Not over a match: it waits for the match to end */}
      <Sheet visible={!!link.asking && !state.match} onClose={link.no} title={t('invite.ask.title', { name })}>
        {link.asking && (
          <View style={styles.askFace}>
            <Face characterId={link.asking.characterId} size={84} />
          </View>
        )}
        <Text style={[versusStyles.body, versusStyles.center]}>{t('invite.ask.body', { name })}</Text>
        {link.failed && <Text style={[styles.failed, versusStyles.center]}>{t('friends.failed')}</Text>}
        <PillButton label={t('invite.ask.yes')} cue="unlock" disabled={link.sending} onPress={link.yes} />
        <PillButton ghost label={t('invite.ask.no')} cue="panel-close" onPress={link.no} />
      </Sheet>
      <FriendNoteBanner />
    </>
  );
}

/** How an invite link went, at the top of any screen but a match, for a few seconds. */
function FriendNoteBanner() {
  const t = useTranslation();
  const { state } = useVersus();
  const insets = useSafeAreaInsets();
  const note = state.friendNote;
  const covered = state.match || state.invites.length > 0;
  useEffect(() => {
    if (note) sound.play(note.kind === 'friends' ? 'unlock' : 'refused');
  }, [note]);
  if (!note || covered) return null;
  return (
    <View pointerEvents="none" style={[styles.banner, { top: insets.top + 6 }]} accessibilityLiveRegion="polite">
      <Raised depth={5} shadowColor={note.kind === 'friends' ? colors.mintD : colors.shadow} radius={22} style={styles.card}>
        {note.kind === 'friends' ? (
          <>
            <Face characterId={note.player.characterId} size={40} />
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={2}>{t('invite.note.friends', { name: displayName(t, note.player.name) })}</Text>
              <Text style={styles.sub}>{t('invite.note.friendsSub')}</Text>
            </View>
          </>
        ) : (
          <Text style={[styles.title, styles.text]}>{t(NOTE_TEXT[note.kind])}</Text>
        )}
      </Raised>
    </View>
  );
}

/** "Invite friends to Hanged": shares the player's own link. `onResult` gets the line to show. */
export function InviteShareCard({ onResult }: { onResult: (message: string | null) => void }) {
  const t = useTranslation();
  const share = useShareInvite();
  const [busy, setBusy] = useState(false);
  return (
    <Raised depth={4} shadowColor={colors.shadow} radius={20} style={[versusStyles.card, styles.share]}>
      <Text style={styles.shareTitle}>{t('invite.share.title')}</Text>
      <Text style={versusStyles.body}>{t('invite.share.body')}</Text>
      <PillButton
        label={t('invite.share.button')}
        cue="link"
        disabled={busy}
        style={styles.shareButton}
        onPress={async () => {
          setBusy(true);
          const done = await share();
          setBusy(false);
          onResult(done === 'copied' ? t('invite.share.copied') : done ? null : t('friends.failed'));
        }}
      />
    </Raised>
  );
}

/** Onboarding's first screen: who invited this new player, or (iOS) a way to paste the link. */
export function OnboardingInvite() {
  const t = useTranslation();
  const invite = usePendingInvite();
  const [from, setFrom] = useState<{ code: string; player: PlayerCard } | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [notInvite, setNotInvite] = useState(false);

  const code = invite?.code;
  useEffect(() => {
    if (!code) return;
    let live = true;
    api.inviter(code).then((player) => live && setFrom({ code, player }), () => {});
    return () => {
      live = false;
    };
  }, [code]);

  // Only whether a link is there (no prompt): the system button reads it, on a tap. Again on coming
  // back to the app, for a player who went to fetch the link
  useEffect(() => {
    if (Platform.OS !== 'ios' || !Clipboard.isPasteButtonAvailable) return;
    let live = true;
    const check = () => Clipboard.hasUrlAsync().then((has) => live && setCanPaste(has), () => {});
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  if (invite) {
    const player = from?.code === invite.code ? from.player : null;
    return (
      <View style={[versusStyles.card, styles.welcome]} accessibilityLiveRegion="polite">
        {player && <Face characterId={player.characterId} size={44} />}
        <View style={styles.text}>
          <Text style={styles.title}>
            {player ? t('invite.onboarding.from', { name: displayName(t, player.name) }) : t('invite.onboarding.someone')}
          </Text>
          <Text style={styles.sub}>{t('invite.onboarding.after')}</Text>
        </View>
      </View>
    );
  }
  if (!canPaste) return null;
  return (
    <View style={[versusStyles.card, styles.welcome]}>
      <View style={styles.text}>
        <Text style={styles.title}>{t('invite.onboarding.paste')}</Text>
        {notInvite && <Text style={styles.failed}>{t('invite.onboarding.notInvite')}</Text>}
      </View>
      <Clipboard.ClipboardPasteButton
        acceptedContentTypes={['url', 'plain-text']}
        backgroundColor={colors.coral}
        foregroundColor="#ffffff"
        cornerStyle="capsule"
        displayMode="iconAndLabel"
        style={styles.paste}
        onPress={(data) => {
          const found = data.type === 'text' ? inviteCodeIn(data.text) : null;
          setNotInvite(!found);
          if (found) receiveInvite(found);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  askFace: { alignItems: 'center', marginBottom: 4 },
  failed: { fontFamily: fonts.body800, fontSize: 13.5, color: colors.coralD },
  banner: { position: 'absolute', left: 12, right: 12, zIndex: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, paddingVertical: 10, paddingLeft: 10, paddingRight: 14 },
  text: { flex: 1, minWidth: 0 },
  title: display('700', 16),
  sub: { fontFamily: fonts.body700, fontSize: 13, color: colors.muted, marginTop: 1 },
  share: { padding: 14, gap: 6, marginBottom: 12 },
  shareTitle: display('700', 18),
  shareButton: { marginTop: 6 },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 16 },
  paste: { width: 104, height: 40 },
});
