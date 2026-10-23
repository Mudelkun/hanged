/*
 * The Versus tab's pieces: a card per mode (quick match, with friends, how to
 * play), the player's rating, join-with-a-code, and the notes shown instead
 * of all that when Versus can't be played (off, offline, app too old, open
 * on another device).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { ModeId, VersusStats } from '../../../server/src/versus-contract';
import { LOBBY_CODE_ALPHABET, VERSUS_LIMITS } from '../../../server/src/versus-contract';
import { sound } from '../../audio';
import { Character, faceXml } from '../../characters/rig';
import { useTranslation } from '../../i18n';
import { characterTint, colors, fonts } from '../../theme';
import { Icon, starXml } from '../icons';
import { Raised } from '../Raised';
import { display, MODE_LOOK, ModeIcon, modeName, modePlayers, modeRules, modeTagline, PillButton, Sheet, versusStyles } from './parts';

export function ModeCard({ mode, onQuick, onFriends }: { mode: ModeId; onQuick: () => void; onFriends: () => void }) {
  const t = useTranslation();
  const look = MODE_LOOK[mode];
  const [rules, setRules] = useState(false);
  return (
    <Raised depth={4} shadowColor={colors.shadow} radius={24} outerStyle={styles.cardOuter} style={[versusStyles.card, styles.card]}>
      <View style={styles.cardHead}>
        <View style={[styles.modeIcon, { backgroundColor: look.light }]}>
          <ModeIcon mode={mode} size={30} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} accessibilityRole="header">{modeName(t, mode)}</Text>
          <Text style={[styles.cardTagline, { color: look.dark }]}>{modeTagline(t, mode)}</Text>
          <Text style={styles.cardPlayers}>{modePlayers(t, mode)}</Text>
        </View>
        <Pressable
          onPress={() => { sound.play('panel-open'); setRules(true); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${t('versus.howToPlay')}: ${modeName(t, mode)}`}
          style={({ pressed }) => [styles.help, { borderColor: look.light }, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.helpText, { color: look.dark }]}>?</Text>
        </Pressable>
      </View>
      <View style={styles.cardButtons}>
        <PillButton label={t('versus.quickMatch')} onPress={onQuick} color={look.main} shadow={look.dark} style={styles.flex} />
        <PillButton label={t('versus.withFriends')} onPress={onFriends} ghost shadow={look.dark} style={styles.flex} />
      </View>
      <Sheet visible={rules} onClose={() => setRules(false)} title={modeName(t, mode)}>
        <Text style={[versusStyles.body, styles.rules]}>{modeRules(t, mode)}</Text>
        <PillButton label={t('versus.gotIt')} onPress={() => setRules(false)} color={look.main} shadow={look.dark} cue="tap" />
      </Sheet>
    </Raised>
  );
}

export function StatsStrip({ stats }: { stats: VersusStats }) {
  const t = useTranslation();
  const items = [
    { value: stats.rating, label: t('versus.stats.rating'), color: colors.butterT },
    { value: stats.won, label: t('versus.stats.won'), color: colors.mintT },
    { value: stats.played, label: t('versus.stats.played'), color: colors.skyT },
  ];
  return (
    <View style={styles.stats}>
      {items.map((item, i) => (
        <View key={item.label} style={[styles.stat, i === 0 && styles.statFirst]}>
          {i === 0 && <Icon xml={starXml(colors.butterD)} size={16} />}
          <Text style={[styles.statValue, { color: item.color }]}>{item.value}</Text>
          <Text style={styles.statLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Join with a code / Friends: the two ways to play with people you know. */
export function SocialRow({ requests, onCode, onFriends }: { requests: number; onCode: () => void; onFriends: () => void }) {
  const t = useTranslation();
  return (
    <View style={styles.social}>
      <PillButton label={t('versus.joinCode')} onPress={onCode} ghost cue="panel-open" style={styles.flex} />
      <View style={styles.flex}>
        <PillButton label={t('versus.friends')} onPress={onFriends} ghost cue="panel-open" />
        {requests > 0 && (
          <View style={styles.badge} accessibilityLabel={t('versus.a11y.requests', { count: requests })}>
            <Text style={styles.badgeText}>{requests}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const cleanCode = (raw: string) =>
  raw
    .toUpperCase()
    .split('')
    .filter((c) => LOBBY_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, VERSUS_LIMITS.codeLength);

export function CodeSheet({ visible, onClose, onJoin }: { visible: boolean; onClose: () => void; onJoin: (code: string) => void }) {
  const t = useTranslation();
  const [code, setCode] = useState('');
  const full = code.length === VERSUS_LIMITS.codeLength;
  const join = () => {
    if (!full) return;
    onJoin(code);
    setCode('');
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('versus.code.title')}>
      <Text style={[versusStyles.body, versusStyles.center]}>{t('versus.code.body')}</Text>
      <TextInput
        value={code}
        onChangeText={(v) => setCode(cleanCode(v))}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={VERSUS_LIMITS.codeLength}
        onSubmitEditing={join}
        returnKeyType="go"
        placeholder="ABC234"
        placeholderTextColor="#d9c8b8"
        accessibilityLabel={t('versus.code.title')}
        style={styles.codeInput}
      />
      <PillButton label={t('versus.code.join')} onPress={join} disabled={!full} />
      <PillButton label={t('versus.cancel')} onPress={onClose} ghost cue="panel-close" />
    </Sheet>
  );
}

/** In place of the modes when Versus can't be played. */
export function VersusNote({ character, title, body, message, action, onAction }: {
  character: Character;
  title: string;
  body: string;
  /** The admin's own words while Versus is off. */
  message?: string | null;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.note}>
      <View style={[styles.noteFace, { backgroundColor: characterTint[character.id] ?? colors.coralL }]}>
        <SvgXml xml={faceXml(character, 'nervous')} width={74} height={74} />
      </View>
      <Text style={[versusStyles.title, versusStyles.center]}>{title}</Text>
      <Text style={[versusStyles.body, versusStyles.center]}>{body}</Text>
      {message ? <Text style={styles.noteMessage}>“{message}”</Text> : null}
      {action && onAction && <PillButton label={action} onPress={onAction} cue="refresh" style={styles.noteButton} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardOuter: { marginBottom: 14 },
  card: { padding: 14, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: display('700', 20),
  cardTagline: { fontFamily: fonts.body800, fontSize: 13.5, marginTop: 1 },
  cardPlayers: { fontFamily: fonts.body700, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  help: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  helpText: display('700', 17),
  cardButtons: { flexDirection: 'row', gap: 10 },
  rules: { fontSize: 15, lineHeight: 22, color: '#6d5a52', marginBottom: 8 },

  stats: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, borderWidth: 2, borderColor: colors.line, marginBottom: 14, paddingVertical: 8 },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, borderLeftWidth: 1.5, borderLeftColor: colors.line },
  statFirst: { borderLeftWidth: 0 },
  statValue: display('700', 20),
  statLabel: { fontFamily: fonts.body800, fontSize: 12, color: colors.muted },

  social: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  badge: { position: 'absolute', top: -6, right: -4, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.coral, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: display('700', 12, '#fff'),

  codeInput: {
    ...display('700', 30),
    letterSpacing: 6,
    textAlign: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 18,
    paddingVertical: 10,
    marginVertical: 4,
  },

  note: { marginTop: 28, alignItems: 'center', paddingHorizontal: 20, gap: 8 },
  noteFace: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  noteMessage: { ...display('600', 15.5, colors.coralD), textAlign: 'center', marginTop: 4 },
  noteButton: { marginTop: 10, minWidth: 180 },
});
