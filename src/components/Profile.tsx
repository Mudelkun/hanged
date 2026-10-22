/*
 * The Profile page's pieces (mockup: Profile): the name card with the
 * character's face and the name editor, the three stat tiles, the settings
 * and info lists, the footer, and the delete-account sheet. The name rules
 * are game rules (src/game/names.ts): the editor only shows what they say.
 * No photo upload (owner's call, 2026-10-22): the avatar is the character.
 */
import { memo, ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Character, faceXml } from '../characters/rig';
import { feedback } from '../feedback';
import { sound } from '../audio';
import { useSoundScope } from '../audio/AudioProvider';
import { checkName, NAME_MAX, NAME_MIN, NameProblem, randomName } from '../game/names';
import { t, TranslationKey } from '../i18n';
import { characterTint, colors, fonts, levelColor } from '../theme';
import { speciesOf } from './CharacterShop';
import { Avatar } from './GameHeader';
import { checkXml, chevXml, closeXml, coinXml, diceXml, Icon, penXml, starXml, tabIconXml } from './icons';
import { popFrom } from './motion';
import { Raised } from './Raised';
import { BigButton } from './RoundParts';

// ---- the name card ----

const PROBLEM_TEXT: Record<NameProblem, TranslationKey> = {
  short: 'profile.name.short',
  long: 'profile.name.long',
  characters: 'profile.name.characters',
  blocked: 'profile.name.blocked',
};
const LIMITS = { min: NAME_MIN, max: NAME_MAX };
const SAVED_MS = 2400;

interface NameCardProps {
  name: string;
  character: Character;
  onRename: (name: string) => void;
  onChangeCharacter: () => void;
}

/**
 * The face (tap: Characters page), the name with its pencil, and "Change
 * character". Tapping the name edits it in place: a text field, a dice for a
 * random name, Cancel and Save. A problem shows as the player types, except
 * "too short", which waits for Save (every name is too short at first).
 */
export function NameCard({ name, character, onRename, onChangeCharacter }: NameCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pop] = useState(() => new Animated.Value(1));
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), SAVED_MS);
    return () => clearTimeout(id);
  }, [saved]);

  const editing = draft !== null;
  const check = editing ? checkName(draft) : null;
  const problem = check && !check.ok && (check.problem !== 'short' || triedSave) ? check.problem : null;

  const startEdit = () => {
    sound.play('edit');
    setDraft(name);
    setTriedSave(false);
    setSaved(false);
  };
  const save = () => {
    if (!check) return;
    if (!check.ok) {
      setTriedSave(true);
      feedback.refused();
      sound.play('name-invalid');
      return;
    }
    setDraft(null);
    if (check.name === name) return;
    onRename(check.name);
    sound.play('name-save');
    feedback.characterPicked();
    setSaved(true);
    popFrom(pop, 1.25);
  };
  const roll = () => {
    sound.play('dice');
    setDraft(randomName());
    setTriedSave(false);
    feedback.unlock();
    input.current?.focus();
  };

  return (
    <Raised depth={4} shadowColor={colors.shadow} radius={26} style={styles.card}>
      <View style={styles.cardRow}>
        <Pressable
          onPress={onChangeCharacter}
          accessibilityRole="button"
          accessibilityLabel={t('profile.a11y.avatar', { name: character.name, species: speciesOf(character) })}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Avatar character={character} size={78} />
          <View style={styles.badge}>
            <Icon xml={tabIconXml.characters('#fff')} size={17} height={16} />
          </View>
        </Pressable>

        <View style={styles.nameSide}>
          <Text style={styles.label}>{t('profile.nameLabel')}</Text>
          {editing ? (
            <TextInput
              ref={input}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={save}
              autoFocus
              selectTextOnFocus
              maxLength={NAME_MAX}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="done"
              placeholder={t('profile.name.placeholder')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('profile.name.placeholder')}
              style={[styles.input, problem && styles.inputBad]}
            />
          ) : (
            <Pressable
              onPress={startEdit}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('profile.a11y.editName', { name })}
              style={styles.nameRow}
            >
              <Animated.Text style={[styles.name, { transform: [{ scale: pop }] }]} numberOfLines={1}>
                {name}
              </Animated.Text>
              <Icon xml={penXml} size={18} />
            </Pressable>
          )}
          {editing ? (
            <Text style={[styles.note, problem && styles.noteBad]} accessibilityLiveRegion="polite">
              {problem ? t(PROBLEM_TEXT[problem], LIMITS) : t('profile.name.help', LIMITS)}
            </Text>
          ) : saved ? (
            <Text style={[styles.note, styles.noteGood]} numberOfLines={1} accessibilityLiveRegion="polite">
              {t('profile.name.saved', { name })}
            </Text>
          ) : (
            <Pressable onPress={onChangeCharacter} accessibilityRole="button" style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <Icon xml={tabIconXml.characters(colors.coralD)} size={16} height={15} />
              <Text style={styles.linkText}>{t('profile.changeCharacter')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {editing && (
        <View style={styles.editBar}>
          <SmallButton onPress={roll} label={t('profile.name.random')} tone="sky">
            <Icon xml={diceXml()} size={22} />
          </SmallButton>
          <View style={styles.flex} />
          <SmallButton onPress={() => { sound.play('panel-close'); setDraft(null); }} label={t('profile.name.cancel')} tone="plain">
            <Icon xml={closeXml(colors.muted)} size={16} />
            <Text style={[styles.smallText, { color: colors.muted }]}>{t('profile.name.cancel')}</Text>
          </SmallButton>
          <SmallButton onPress={save} label={t('profile.name.save')} tone="mint">
            <Icon xml={checkXml} size={17} />
            <Text style={styles.smallText}>{t('profile.name.save')}</Text>
          </SmallButton>
        </View>
      )}
    </Raised>
  );
}

const TONES = {
  sky: { bg: colors.skyL, shadow: '#bfe2f8', border: '#cbe8fb' },
  plain: { bg: '#fff', shadow: colors.shadow, border: colors.line },
  mint: { bg: colors.mint, shadow: colors.mintD, border: colors.mint },
};

function SmallButton({ onPress, label, tone, children }: { onPress: () => void; label: string; tone: keyof typeof TONES; children: ReactNode }) {
  const c = TONES[tone];
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <Raised depth={3} shadowColor={c.shadow} radius={13} pressed={pressed} style={[styles.small, { backgroundColor: c.bg, borderColor: c.border }]}>
          {children}
        </Raised>
      )}
    </Pressable>
  );
}

// ---- stats ----

/** Words guessed (mint), tokens (butter), and the level in its own colour. */
export const StatTiles = memo(function StatTiles({ words, tokens, level }: { words: number; tokens: number; level: number }) {
  const lv = levelColor(level);
  return (
    <View style={styles.stats}>
      <Stat value={words} label={t(words === 1 ? 'profile.stat.word' : 'profile.stat.words')} bg={colors.mintL} color={colors.mintT} />
      <Stat value={tokens} label={t('profile.stat.tokens')} bg={colors.butterL} color={colors.butterT} icon={coinXml} />
      <Stat value={level} label={t('profile.stat.level')} bg={lv.light} color={lv.dark} icon={starXml(lv.main)} />
    </View>
  );
});

function Stat({ value, label, bg, color, icon }: { value: number; label: string; bg: string; color: string; icon?: string }) {
  return (
    <Raised depth={3} shadowColor={colors.shadow} radius={18} outerStyle={styles.flex} style={[styles.stat, { backgroundColor: bg }]}>
      <View style={styles.statValue} accessible accessibilityLabel={`${value} ${label}`}>
        {icon && <Icon xml={icon} size={19} />}
        <Text style={[styles.statNumber, { color }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </Raised>
  );
}

// ---- lists ----

export interface ListItem {
  key: string;
  icon: string;
  color: string;
  label: string;
  /** Shown on the right, e.g. the language. */
  value?: string;
  /** Without it the row is plain text (no chevron). */
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (enabled: boolean) => void };
}

/** A titled white group of rows (SETTINGS, INFO & LEGAL). */
export function ListGroup({ title, items }: { title: string; items: ListItem[] }) {
  return (
    <View>
      <Text style={styles.groupTitle} accessibilityRole="header">
        {title}
      </Text>
      <Raised depth={3} shadowColor={colors.shadow} radius={20} outerStyle={styles.groupOuter} style={styles.group}>
        {items.map((item, i) => item.toggle ? (
          <View key={item.key} style={[styles.row, i > 0 && styles.rowLine]}>
            <View style={[styles.rowIcon, { backgroundColor: item.color }]}><Icon xml={item.icon} size={17} /></View>
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Switch accessibilityLabel={item.label} value={item.toggle.value} onValueChange={item.toggle.onChange}
              trackColor={{ false: colors.line, true: colors.mintD }} thumbColor="#fff" ios_backgroundColor={colors.line} />
          </View>
        ) : (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            disabled={!item.onPress}
            accessibilityRole={item.onPress ? 'button' : 'text'}
            accessibilityLabel={item.value ? `${item.label}: ${item.value}` : item.label}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && styles.rowPressed]}
          >
            <View style={[styles.rowIcon, { backgroundColor: item.color }]}>
              <Icon xml={item.icon} size={17} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {item.label}
            </Text>
            {item.value && <Text style={styles.rowValue}>{item.value}</Text>}
            {item.onPress && <Icon xml={chevXml('r', colors.xMark)} size={15} />}
          </Pressable>
        ))}
      </Raised>
    </View>
  );
}

// ---- footer ----

export function ProfileFooter({ version, onDelete }: { version: string; onDelete: () => void }) {
  return (
    <View style={styles.foot}>
      <Text style={styles.footText} numberOfLines={1}>
        {t('profile.version', { app: t('app.name'), version })}
      </Text>
      <Pressable onPress={onDelete} hitSlop={10} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.delete}>{t('profile.delete')}</Text>
      </Pressable>
    </View>
  );
}

// ---- delete account ----

interface DeleteSheetProps {
  visible: boolean;
  character: Character;
  onClose: () => void;
  /** Resolves false when the account couldn't be deleted (offline). */
  onConfirm: () => Promise<boolean>;
}

/** "Delete your account?" over the page. Offline, it says so and stays open. */
export function DeleteSheet({ visible, character, onClose, onConfirm }: DeleteSheetProps) {
  const audio = useSoundScope();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const canDelete = confirmation === 'DELETE';

  // Reset while hidden so a reopened sheet cannot reuse an earlier confirmation.
  if (!visible && (confirmation !== '' || failed)) {
    setConfirmation('');
    setFailed(false);
  }

  const close = () => {
    if (busy) return;
    setConfirmation('');
    setFailed(false);
    audio.play('panel-close');
    onClose();
  };
  const confirm = async () => {
    if (!visible || busy || !canDelete) return;
    audio.play('delete-confirm');
    setBusy(true);
    setFailed(false);
    const done = await onConfirm();
    setBusy(false);
    if (!done) {
      audio.play('operation-failed');
      setFailed(true);
      feedback.refused();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('delete.keep')} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={[styles.sadFace, { backgroundColor: characterTint[character.id] ?? colors.coralL }]}>
              <SvgXml xml={faceXml(character, 'worried')} width={70} height={70} />
            </View>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {t('delete.title')}
            </Text>
            <Text style={styles.sheetBody}>{t('delete.body')}</Text>
            <Text style={styles.confirmLabel}>{t('delete.typeToConfirm')}</Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              editable={!busy}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              returnKeyType="done"
              placeholder="DELETE"
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('delete.typeToConfirm')}
              style={[styles.input, styles.confirmInput]}
            />
            {failed && (
              <Text style={styles.sheetError} accessibilityLiveRegion="assertive">
                {t('delete.offline')}
              </Text>
            )}
            <View style={styles.sheetButtons}>
              <BigButton cue={false} label={busy ? t('delete.working') : t('delete.confirm')} onPress={confirm} disabled={busy || !canDelete} />
              <BigButton cue={false} ghost label={t('delete.keep')} onPress={close} disabled={busy} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---- styles ----

const display = (weight: '500' | '600' | '700', fontSize: number, color: string = colors.ink) => ({
  fontFamily: weight === '500' ? fonts.display500 : weight === '600' ? fonts.display600 : fonts.display700,
  fontSize,
  color,
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  card: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, paddingVertical: 12, paddingHorizontal: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: {
    position: 'absolute',
    right: -6,
    bottom: -3,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.coral,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameSide: { flex: 1, minWidth: 0 },
  label: { ...display('600', 11.5, colors.muted), letterSpacing: 0.8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  name: { ...display('700', 25), lineHeight: 30, flexShrink: 1 },
  input: {
    ...display('700', 21),
    height: 40,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.sky,
    backgroundColor: '#f6fbff',
  },
  inputBad: { borderColor: colors.coral, backgroundColor: '#fff6f4' },
  note: { ...display('500', 12.5, colors.muted), marginTop: 5 },
  noteBad: { color: colors.coralD },
  noteGood: { color: colors.mintT, fontFamily: fonts.display600 },
  link: {
    marginTop: 5,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.coralL,
    borderRadius: 11,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  linkText: display('600', 13.5, colors.coralD),
  editBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  small: { height: 38, minWidth: 40, paddingHorizontal: 11, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  smallText: display('600', 15, '#fff'),

  stats: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  stat: { borderWidth: 2, borderColor: '#fff', paddingTop: 7, paddingBottom: 6, alignItems: 'center' },
  statValue: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  statNumber: { ...display('700', 22), lineHeight: 26, flexShrink: 1 },
  statLabel: display('500', 12, colors.muted),

  groupTitle: { ...display('600', 12.5, colors.muted), letterSpacing: 1, marginHorizontal: 8, marginBottom: 5 },
  groupOuter: { marginBottom: 14 },
  group: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, height: 46, paddingLeft: 10, paddingRight: 13 },
  rowLine: { borderTopWidth: 1.5, borderTopColor: '#f5ebde' },
  rowPressed: { backgroundColor: '#fff8f0' },
  rowIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { ...display('500', 15.5), flex: 1 },
  rowValue: display('500', 14, colors.muted),

  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginHorizontal: 8, marginTop: 2 },
  footText: { flexShrink: 1, fontFamily: fonts.body800, fontSize: 11.5, color: colors.muted },
  delete: display('600', 13, colors.coralD),

  backdrop: { flex: 1, backgroundColor: 'rgba(75,58,53,0.45)' },
  sheetScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.paper,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#fff',
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 10,
    alignItems: 'center',
  },
  sadFace: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetTitle: { ...display('700', 23), marginTop: 10, textAlign: 'center' },
  sheetBody: { fontFamily: fonts.body700, fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center', marginTop: 6 },
  confirmLabel: { ...display('500', 15), textAlign: 'center', marginTop: 16 },
  confirmInput: { alignSelf: 'stretch', height: 48, marginTop: 8, textAlign: 'center', letterSpacing: 2 },
  sheetError: { ...display('600', 14, colors.coralD), textAlign: 'center', marginTop: 10 },
  sheetButtons: { alignSelf: 'stretch', marginTop: 10 },
});
