/*
 * Pieces every Versus screen shares: each mode's colour, icon and texts, the
 * server-clock countdown, players' faces, pill buttons, the sheet, the score
 * chips and the toast.
 */
import { ReactNode, memo, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import type { MatchPlayer, ModeId } from '../../../server/src/versus-contract';
import { MODES } from '../../../server/src/versus-contract';
import { sound, Cue } from '../../audio';
import { characterById } from '../../characters/rig';
import { TranslationKey, Translator, useTranslation } from '../../i18n';
import type { Notice } from '../../state/versus';
import { useVersus } from '../../state/VersusContext';
import { colors, fonts } from '../../theme';
import { Avatar } from '../GameHeader';
import { balloonXml, Icon, modeIconXml } from '../icons';
import { Raised } from '../Raised';

/** Each mode's colour: sky for the race, coral for the battle, lilac for the duel. */
export const MODE_LOOK: Record<ModeId, { main: string; light: string; dark: string }> = {
  rush: { main: colors.sky, light: colors.skyL, dark: colors.skyT },
  battle: { main: colors.coral, light: colors.coralL, dark: colors.coralD },
  duel: { main: '#a98bf5', light: '#efe9ff', dark: '#7656dc' },
};

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const modeName = (t: Translator, mode: ModeId) => t(`versus.modes.${mode}.name` as TranslationKey);

export function modeTagline(t: Translator, mode: ModeId) {
  return t(`versus.modes.${mode}.tagline` as TranslationKey, { time: formatClock(MODES.rush.durationMs / 1000) });
}

/** The rules of a mode, with the numbers read from the shared contract. */
export function modeRules(t: Translator, mode: ModeId) {
  return t(`versus.modes.${mode}.rules` as TranslationKey, {
    misses: MODES.rush.maxWrong,
    balloons: MODES.battle.balloons,
    rounds: MODES.duel.rounds,
    time: formatClock(MODES.rush.durationMs / 1000),
  });
}

export const modePlayers = (t: Translator, mode: ModeId) =>
  MODES[mode].maxPlayers === 2 ? t('versus.duelPlayers') : t('versus.players', { min: MODES[mode].minPlayers, max: MODES[mode].maxPlayers });

export const displayName = (t: Translator, name: string | null) => name ?? t('player.defaultName');

/** Seconds left until a server deadline, ticking four times a second; null without one. */
export function useSecondsLeft(endsAt: number | null): number | null {
  const { serverNow } = useVersus();
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => setNow(serverNow());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [endsAt, serverNow]);
  return endsAt === null || !now ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Seconds since a server time (the queue's wait). */
export function useSecondsSince(since: number): number {
  const { serverNow } = useVersus();
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, [serverNow]);
  return Math.max(0, Math.floor((now - since) / 1000));
}

export const Face = memo(function Face({ characterId, size, plain = true }: { characterId: string; size: number; plain?: boolean }) {
  return <Avatar character={characterById(characterId)} size={size} plain={plain} />;
});

export function ModeIcon({ mode, size, color }: { mode: ModeId; size: number; color?: string }) {
  return <Icon xml={modeIconXml[mode](color ?? MODE_LOOK[mode].main)} size={size} />;
}

export function ModeChip({ mode }: { mode: ModeId }) {
  const t = useTranslation();
  const look = MODE_LOOK[mode];
  return (
    <View style={[styles.chip, { backgroundColor: look.light }]}>
      <ModeIcon mode={mode} size={16} />
      <Text style={[styles.chipText, { color: look.dark }]}>{modeName(t, mode)}</Text>
    </View>
  );
}

/** A smaller button than BigButton, for rows and cards. */
export function PillButton({ label, onPress, color = colors.coral, shadow = colors.coralD, ghost, disabled, cue = 'primary', style, small }: {
  label: string;
  onPress: () => void;
  color?: string;
  shadow?: string;
  ghost?: boolean;
  disabled?: boolean;
  cue?: Cue | false;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        sound.unlock();
        if (cue) sound.play(ghost && cue === 'primary' ? 'tap' : cue);
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[style, disabled && styles.disabled]}
      hitSlop={4}
    >
      {({ pressed }) => (
        <Raised
          depth={small ? 3 : 4}
          pressed={pressed}
          shadowColor={ghost ? colors.shadow : shadow}
          radius={small ? 13 : 16}
          style={[styles.pill, small && styles.pillSmall, ghost ? styles.pillGhost : { backgroundColor: color }]}
        >
          <Text style={[styles.pillText, small && styles.pillTextSmall, ghost && { color: shadow === colors.coralD ? colors.coralD : shadow }]} numberOfLines={1}>
            {label}
          </Text>
        </Raised>
      )}
    </Pressable>
  );
}

/** A card over the screen, like the delete-account sheet. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { sound.play('panel-close'); onClose(); }} accessibilityLabel={t('versus.close')} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text>
          <ScrollView style={styles.sheetBody} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A section's small capitals title. */
export const Label = ({ children }: { children: ReactNode }) => <Text style={styles.label}>{children}</Text>;

/** One player in the match's score row: face, name, score, and how they're doing. */
export const ScoreChip = memo(function ScoreChip({ player, mode, me, flash }: { player: MatchPlayer; mode: ModeId; me: boolean; flash?: boolean }) {
  const t = useTranslation();
  const gone = player.link === 'left';
  const status = gone ? t('versus.match.left') : player.link === 'away' ? t('versus.match.away') : mode === 'battle' && player.out ? t('versus.match.out') : null;
  return (
    <View
      style={[styles.score, me && styles.scoreMe, flash && styles.scoreHit, (gone || (mode === 'battle' && player.out)) && styles.scoreGone]}
      accessible
      accessibilityLabel={t('versus.a11y.player', { name: displayName(t, player.name), score: player.score })}
    >
      <Face characterId={player.characterId} size={28} />
      <View style={styles.scoreBody}>
        <Text style={[styles.scoreName, me && styles.scoreNameMe]} numberOfLines={1}>{me ? t('versus.you') : displayName(t, player.name)}</Text>
        {status ? (
          <Text style={styles.scoreStatus} numberOfLines={1}>{status}</Text>
        ) : mode === 'battle' ? (
          <View style={styles.balloons}>
            <Icon xml={balloonXml(me ? '#fff' : colors.coral)} size={13} />
            <Text style={[styles.scoreSub, me && styles.scoreSubMe]}>{player.balloons}</Text>
          </View>
        ) : (
          <View style={styles.progress}>
            <View style={[styles.progressFill, me && styles.progressFillMe, { width: `${player.toFind ? (100 * player.found) / player.toFind : 0}%` }]} />
          </View>
        )}
      </View>
      <Text style={[styles.scoreNumber, me && styles.scoreNumberMe]}>{player.score}</Text>
    </View>
  );
});

const NOTICE_TEXT: Record<string, TranslationKey> = {
  kicked: 'versus.notice.kicked',
  closed: 'versus.notice.closed',
  disabled: 'versus.notice.disabled',
};

export function noticeText(t: Translator, n: Notice): string {
  switch (n.kind) {
    case 'error':
      return t(`versus.error.${n.code}` as TranslationKey);
    case 'declined':
      return t('versus.notice.declined', { name: displayName(t, n.name) });
    case 'lobbyGone':
      return t(NOTICE_TEXT[n.reason] ?? 'versus.notice.closed');
    case 'matchLost':
      return t('versus.notice.matchLost');
  }
}

/** The latest notice (a refused action, a declined invite…), for a few seconds. */
export function VersusToast({ bottom }: { bottom: number }) {
  const t = useTranslation();
  const { state } = useVersus();
  const notice = state.notice;
  useEffect(() => {
    if (notice) sound.play(notice.kind === 'error' ? 'refused' : 'tap');
  }, [notice]);
  if (!notice) return null;
  return (
    <View pointerEvents="none" style={[styles.toast, { bottom }]} accessibilityLiveRegion="polite">
      <Text style={styles.toastText}>{noticeText(t, notice)}</Text>
    </View>
  );
}

export const display = (weight: '600' | '700', fontSize: number, color: string = colors.ink) => ({
  fontFamily: weight === '600' ? fonts.display600 : fonts.display700,
  fontSize,
  color,
});

export const versusStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line },
  body: { fontFamily: fonts.body700, fontSize: 14.5, lineHeight: 20, color: colors.muted },
  title: display('700', 22),
  center: { textAlign: 'center' },
});

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', borderRadius: 12, paddingVertical: 3, paddingLeft: 6, paddingRight: 10 },
  chipText: display('600', 13.5),
  disabled: { opacity: 0.45 },
  pill: { minHeight: 46, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pillSmall: { minHeight: 34, paddingHorizontal: 11 },
  pillGhost: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line },
  pillText: display('600', 16.5, '#fff'),
  pillTextSmall: { fontSize: 14 },

  backdrop: { flex: 1, backgroundColor: 'rgba(75,58,53,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 420, maxHeight: '80%', backgroundColor: colors.paper, borderRadius: 28, padding: 18, borderWidth: 3, borderColor: '#fff' },
  sheetTitle: { ...display('700', 21), textAlign: 'center', marginBottom: 10 },
  sheetBody: { flexGrow: 0 },

  label: { fontFamily: fonts.display600, fontSize: 12.5, letterSpacing: 1, color: colors.muted, marginTop: 14, marginBottom: 6, marginLeft: 4 },

  score: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: colors.line, paddingVertical: 5, paddingLeft: 5, paddingRight: 8 },
  scoreMe: { backgroundColor: colors.coral, borderColor: '#fff' },
  scoreHit: { borderColor: colors.coralD, backgroundColor: colors.coralL },
  scoreGone: { opacity: 0.45 },
  scoreBody: { flex: 1, minWidth: 0, gap: 3 },
  scoreName: display('600', 12.5),
  scoreNameMe: { color: '#fff' },
  scoreStatus: { fontFamily: fonts.body800, fontSize: 10.5, color: colors.muted },
  scoreSub: display('600', 12, colors.coralD),
  scoreSubMe: { color: '#fff' },
  scoreNumber: display('700', 20),
  scoreNumberMe: { color: '#fff' },
  balloons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  progress: { height: 5, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.mint },
  progressFillMe: { backgroundColor: '#fff' },

  toast: { position: 'absolute', left: 24, right: 24, alignItems: 'center', zIndex: 20 },
  toastText: { ...display('600', 15, '#fff'), backgroundColor: colors.ink, borderRadius: 16, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 9, textAlign: 'center' },
});
