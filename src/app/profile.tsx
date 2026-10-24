/*
 * The Profile page (mockup: Profile), pushed over the tabs from the avatar at
 * the top-left of Play, Leaderboard and Characters. The player's name (the
 * only thing they edit here), their character, stats, settings, the info and
 * legal pages, and account deletion (App Store Guideline 5.1.1(v)).
 * The avatar is the character. Music and effects now have separate saved switches,
 * and the daily reminder its own (useDaily.ts).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import appConfig from '../../app.json';
import { characterById } from '../characters/rig';
import { sound } from '../audio';
import { BackHeader } from '../components/GameHeader';
import { profileIconXml } from '../components/icons';
import { INFO_PAGES, InfoPage } from '../components/InfoPages';
import { PaperBackground } from '../components/PaperBackground';
import { LanguageSheet } from '../components/LanguagePicker';
import { dailyDays, dailyStatus } from '../game/daily';
import { LANGUAGES } from '../game/languages';
import { DailyCard, DeleteSheet, ListGroup, ListItem, NameCard, ProfileFooter, StatTiles } from '../components/Profile';
import { remindersSupported } from '../notify/reminders';
import { Translator, useTranslation } from '../i18n';
import { useGame } from '../state/GameContext';
import { useToday } from '../state/useDaily';
import { colors } from '../theme';

/** The info & legal rows, in the mockup's order. */
const infoItems = (t: Translator): ListItem[] =>
  (Object.keys(INFO_PAGES) as InfoPage[]).map((page) => ({
    key: page,
    icon: INFO_PAGES[page].icon,
    color: INFO_PAGES[page].color,
    label: t(INFO_PAGES[page].title),
    onPress: () => { sound.play('panel-open'); router.push({ pathname: '/info/[page]', params: { page } }); },
  }));

export default function ProfileScreen() {
  const t = useTranslation();
  const { state, dispatch, deleteAccount, nameIsFree, setReminders } = useGame();
  const today = useToday();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);
  const [choosingLanguage, setChoosingLanguage] = useState(false);
  const character = characterById(state.characterId);
  const setAudio = (setting: 'soundEnabled' | 'musicEnabled', enabled: boolean) => {
    sound.unlock();
    sound.settings(setting === 'soundEnabled' ? enabled : state.soundEnabled, setting === 'musicEnabled' ? enabled : state.musicEnabled);
    if (enabled || setting === 'musicEnabled') sound.play('tap');
    dispatch({ type: 'audioSetting', setting, enabled });
  };

  const settings: ListItem[] = [
    { key: 'sound', icon: profileIconXml.sound, color: colors.coral, label: t('profile.sound'), toggle: { value: state.soundEnabled, onChange: value => setAudio('soundEnabled', value) } },
    { key: 'music', icon: profileIconXml.music, color: colors.mintD, label: t('profile.music'), toggle: { value: state.musicEnabled, onChange: value => setAudio('musicEnabled', value) } },
    ...(remindersSupported ? [{ key: 'reminders', icon: profileIconXml.reminders, color: colors.flame, label: t('profile.reminders'),
      toggle: { value: state.reminders === true, onChange: (value: boolean) => { sound.play('tap'); void setReminders(value); } } }] : []),
    { key: 'language', icon: profileIconXml.language, color: colors.sky, label: t('profile.language'),
      value: LANGUAGES.find(l => l.id === state.language)?.name, onPress: () => setChoosingLanguage(true) },
  ];

  const onDeleted = async () => {
    const done = await deleteAccount();
    if (done) {
      sound.play('delete-complete');
      setDeleting(false);
      // Resetting the save makes the root route guard return to onboarding.
    }
    return done;
  };

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <View style={{ height: insets.top }} />
      <BackHeader title={t('profile.title')} tokens={state.tokens} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <NameCard
          name={state.playerName ?? t('player.defaultName')}
          takenName={state.takenName}
          character={character}
          onRename={(name) => dispatch({ type: 'rename', name })}
          isNameFree={nameIsFree}
          onChangeCharacter={() => { sound.play('tab'); router.dismissTo('/characters'); }}
        />
        <StatTiles words={state.wordsGuessed} tokens={state.tokens} level={state.levelProgress.level} />
        <DailyCard days={dailyDays(state.daily, today)} best={state.daily.best} status={dailyStatus(state.daily, today)} />
        <ListGroup title={t('profile.settings')} items={settings} />
        <ListGroup title={t('profile.info')} items={infoItems(t)} />
        <ProfileFooter version={appConfig.expo.version} onDelete={() => { sound.play('delete-open'); setDeleting(true); }} />
      </ScrollView>
      <DeleteSheet visible={deleting} character={character} onClose={() => setDeleting(false)} onConfirm={onDeleted} />
      {choosingLanguage && <LanguageSheet onClose={() => setChoosingLanguage(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 16, paddingTop: 2 },
});
