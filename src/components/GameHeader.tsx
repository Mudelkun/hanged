/*
 * In-game header (Play and Round lost): the player's avatar and name (never
 * the app name), words guessed, level and token balance.
 * The avatar is the button that will open the Profile page (not built yet).
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Character, faceXml } from '../characters/rig';
import { t } from '../i18n';
import { characterTint, colors, fonts } from '../theme';
import { Icon, starXml } from './icons';
import { TokenPill } from './TokenPill';

interface Props {
  name: string;
  character: Character;
  wordsGuessed: number;
  level: number;
  tokens: number;
}

export const Avatar = memo(function Avatar({ character, size }: { character: Character; size: number }) {
  return (
    <View style={[styles.avatarRing, { width: size + 5, height: size + 5, borderRadius: (size + 5) / 2 }]}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: characterTint[character.id] ?? '#ffeedd' },
        ]}
      >
        <SvgXml xml={faceXml(character)} width={size - 2} height={size - 2} />
      </View>
    </View>
  );
});

export function GameHeader({ name, character, wordsGuessed, level, tokens }: Props) {
  return (
    <View style={styles.head}>
      <View style={styles.side}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('header.a11y.avatar')} disabled>
          <Avatar character={character} size={46} />
        </Pressable>
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.sub}>
            {wordsGuessed === 1 ? t('header.wordGuessed') : t('header.wordsGuessed', { count: wordsGuessed })}
          </Text>
        </View>
      </View>
      <View style={styles.side}>
        <View style={styles.level}>
          <Icon xml={starXml()} size={15} />
          <Text style={styles.levelText}>{t('header.level', { level })}</Text>
        </View>
        <TokenPill tokens={tokens} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    height: 60,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  nameBlock: { flexShrink: 1 },
  avatarRing: {
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e85c4d',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  avatar: { borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontFamily: fonts.display700, fontSize: 27, lineHeight: 30, color: colors.ink },
  sub: { fontFamily: fonts.body800, fontSize: 11.5, color: colors.muted, marginTop: 1, letterSpacing: 0.2 },
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.mintL,
    borderColor: '#c3eedb',
    borderWidth: 2,
    borderRadius: 13,
    paddingVertical: 5,
    paddingLeft: 7,
    paddingRight: 10,
  },
  levelText: { fontFamily: fonts.display600, fontSize: 14, color: colors.mintT },
});
