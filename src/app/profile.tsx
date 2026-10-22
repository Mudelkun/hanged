/*
 * The Profile page (mockup: Profile), pushed over the tabs from the avatar at
 * the top-left of Play, Leaderboard and Characters. The player's name (the
 * only thing they edit here), their character, stats, settings, the info and
 * legal pages, and account deletion (App Store Guideline 5.1.1(v)).
 * Owner's calls (2026-10-22): no photo upload, the avatar is the character;
 * no sound or music switches until the game has sound.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import appConfig from '../../app.json';
import { characterById } from '../characters/rig';
import { BackHeader } from '../components/GameHeader';
import { profileIconXml } from '../components/icons';
import { INFO_PAGES, InfoPage } from '../components/InfoPages';
import { PaperBackground } from '../components/PaperBackground';
import { DeleteSheet, ListGroup, ListItem, NameCard, ProfileFooter, StatTiles } from '../components/Profile';
import { t, TranslationKey } from '../i18n';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';

/** The info & legal rows, in the mockup's order. */
const infoItems = (): ListItem[] =>
  (Object.keys(INFO_PAGES) as InfoPage[]).map((page) => ({
    key: page,
    icon: INFO_PAGES[page].icon,
    color: INFO_PAGES[page].color,
    label: t(INFO_PAGES[page].title),
    onPress: () => router.push({ pathname: '/info/[page]', params: { page } }),
  }));

export default function ProfileScreen() {
  const { state, dispatch, deleteAccount } = useGame();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);
  const character = characterById(state.characterId);

  const settings: ListItem[] = [
    // The MVP is English only: the row shows the language, a picker comes with the second one.
    { key: 'language', icon: profileIconXml.language, color: colors.sky, label: t('profile.language'), value: t(`language.${state.language}` as TranslationKey) },
  ];

  const onDeleted = async () => {
    const done = await deleteAccount();
    if (done) {
      setDeleting(false);
      router.dismissTo('/');
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
          character={character}
          onRename={(name) => dispatch({ type: 'rename', name })}
          onChangeCharacter={() => router.dismissTo('/characters')}
        />
        <StatTiles words={state.wordsGuessed} tokens={state.tokens} level={state.levelProgress.level} />
        <ListGroup title={t('profile.settings')} items={settings} />
        <ListGroup title={t('profile.info')} items={infoItems()} />
        <ProfileFooter version={appConfig.expo.version} onDelete={() => setDeleting(true)} />
      </ScrollView>
      <DeleteSheet visible={deleting} character={character} onClose={() => setDeleting(false)} onConfirm={onDeleted} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 16, paddingTop: 2 },
});
