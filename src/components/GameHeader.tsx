/*
 * In-game header (Play and Round lost): the player's avatar and name (never
 * the app name), words guessed, level and token balance.
 * The avatar is the button that will open the Profile page (not built yet).
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Character, faceXml } from '../characters/rig';
import { t } from '../i18n';
import { characterTint, colors, fonts, levelColor } from '../theme';
import { Icon, starXml } from './icons';
import { popFrom } from './motion';
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

/** "Lv N" in the level's own colour. It pops when the level changes, never when it first shows. */
const LevelPill = memo(function LevelPill({ level }: { level: number }) {
  const [pop] = useState(() => new Animated.Value(1));
  const prev = useRef(level);
  useEffect(() => {
    if (level === prev.current) return;
    prev.current = level;
    popFrom(pop, 1.35);
  }, [level, pop]);
  const c = levelColor(level);
  return (
    <Animated.View style={[styles.level, { backgroundColor: c.light, borderColor: `${c.main}80`, transform: [{ scale: pop }] }]}>
      <Icon xml={starXml(c.main)} size={15} />
      <Text style={[styles.levelText, { color: c.dark }]}>{t('header.level', { level })}</Text>
    </Animated.View>
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
        <LevelPill level={level} />
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
    borderWidth: 2,
    borderRadius: 13,
    paddingVertical: 5,
    paddingLeft: 7,
    paddingRight: 10,
  },
  levelText: { fontFamily: fonts.display600, fontSize: 14 },
});
