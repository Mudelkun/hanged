/*
 * The Developer group on Profile (Context/dev-accounts.md), shown only to an
 * account whose role has `devTools` (server/src/roles.ts). Every tool sends
 * the game's ordinary actions (jumpToLevel, guess), so the rules stay in the
 * reducer and a developer's round ends, scores and moves the level like any.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sound } from '../audio';
import { roundStatus } from '../game/engine';
import { LEVELS } from '../game/levels';
import { can } from '../game/progress';
import { useTranslation } from '../i18n';
import { useGame } from '../state/GameContext';
import { colors, fonts, levelColor } from '../theme';
import { BigButton } from './RoundParts';
import { profileIconXml } from './icons';
import { ListGroup, ListItem } from './Profile';
import { Raised } from './Raised';
import { Sheet, sheetText } from './Sheet';

/** Back to Play, where the new word or the finished round shows. */
const toPlay = () => router.dismissTo('/');

export function DevToolsGroup() {
  const t = useTranslation();
  const { state, jumpToLevel, finishRound } = useGame();
  const [picking, setPicking] = useState(false);
  const level = state.levelProgress.level;
  const playing = !!state.round && roundStatus(state.round) === 'playing';
  const run = (action: () => void) => () => { sound.play('tap'); action(); toPlay(); };

  const items: ListItem[] = [
    ...(can(state, 'anyLevel') ? [
      { key: 'level', icon: profileIconXml.devLevel, color: levelColor(level).main, label: t('dev.level'),
        value: t('header.level', { level }), onPress: () => { sound.play('panel-open'); setPicking(true); } },
      { key: 'word', icon: profileIconXml.devWord, color: colors.sky, label: t('dev.newWord'), onPress: run(() => jumpToLevel(level)) },
    ] : []),
    { key: 'win', icon: profileIconXml.devWin, color: colors.mintD, label: t('dev.win'), onPress: playing ? run(() => finishRound(true)) : undefined },
    { key: 'lose', icon: profileIconXml.devLose, color: colors.coral, label: t('dev.lose'), onPress: playing ? run(() => finishRound(false)) : undefined },
  ];

  return (
    <View>
      <ListGroup title={t('dev.title')} items={items} />
      <Text style={styles.note}>{t('dev.note')}</Text>
      {picking && (
        <LevelSheet
          current={level}
          onPick={(n) => { setPicking(false); run(() => jumpToLevel(n))(); }}
          onClose={() => setPicking(false)}
        />
      )}
    </View>
  );
}

function LevelSheet({ current, onPick, onClose }: { current: number; onPick: (level: number) => void; onClose: () => void }) {
  const t = useTranslation();
  return (
    <Sheet onClose={onClose} closeLabel={t('dev.close')}>
      <Text style={sheetText.title} accessibilityRole="header">{t('dev.level')}</Text>
      <Text style={sheetText.help}>{t('dev.levelHelp')}</Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {LEVELS.map(({ level }) => {
          const color = levelColor(level);
          const selected = level === current;
          return (
            <Pressable key={level} onPress={() => onPick(level)} accessibilityRole="radio"
              accessibilityState={{ checked: selected }} accessibilityLabel={t('header.level', { level })}>
              {({ pressed }) => (
                <Raised depth={3} radius={16} pressed={pressed} shadowColor={color.dark}
                  style={[styles.stop, { backgroundColor: selected ? color.main : color.light, borderColor: color.main }]}>
                  <Text style={[styles.stopText, { color: selected ? '#fff' : color.dark }]}>{level}</Text>
                </Raised>
              )}
            </Pressable>
          );
        })}
      </View>
      <BigButton label={t('dev.close')} onPress={onClose} />
    </Sheet>
  );
}

const STOP = 56;

const styles = StyleSheet.create({
  // Under the group (whose own margin is 14): tucked up to it, and the same room before the next group.
  note: { fontFamily: fonts.body600, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: -6, marginBottom: 16, marginHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginVertical: 14 },
  stop: { width: STOP, height: STOP, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stopText: { fontFamily: fonts.display700, fontSize: 22 },
});
