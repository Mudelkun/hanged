/*
 * The headers. In game (Play and Round lost): the player's avatar and name
 * (never the app name), words guessed, the daily streak, level and token balance. On the other
 * tabs (TitleHeader): avatar, the screen's title, token balance (`live` on a
 * screen where tokens are spent, so the spend flies into it). On a pushed
 * page (BackHeader): back button, title, token balance.
 * The avatar opens the Profile page; the level pill opens the level map (LevelMap).
 * In game, the daily streak sits on the avatar's corner (it takes no room from the name).
 */
import { router } from 'expo-router';
import { memo, ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { avatarRing, avatarXml, Character } from '../characters/rig';
import { LEVELS } from '../game/levels';
import { useTranslation } from '../i18n';
import { colors, fonts, levelColor } from '../theme';
import { sound } from '../audio';
import { chevXml, crownXml, flameXml, Icon, starXml } from './icons';
import { popFrom } from './motion';
import { Raised } from './Raised';
import { StillTokenPill, TokenPill } from './TokenPill';

interface Props {
  name: string;
  character: Character;
  wordsGuessed: number;
  level: number;
  tokens: number;
  /** The daily streak the player sees today (daily.dailyDays). Hidden at 0. */
  dailyDays: number;
  /** Today already counts: the flame is lit. */
  dailyDone: boolean;
  /** Opens the level map. Left out while the level is changing (the level-up card is showing it). */
  onLevelPress?: () => void;
}

/**
 * The character's profile picture (its persona on its own backdrop, rig.js) in a ring of its colour:
 * a thick one for the player's own profile button, a thin `plain` one for other players.
 */
export const Avatar = memo(function Avatar({ character, size, plain }: { character: Character; size: number; plain?: boolean }) {
  const ring = size + (plain ? 3 : 5);
  // Inside the white border
  const inner = size - AVATAR_BORDER * 2;
  return (
    <View
      style={[
        styles.avatarRing,
        plain && styles.avatarPlain,
        { width: ring, height: ring, borderRadius: ring / 2, backgroundColor: avatarRing(character) },
      ]}
    >
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        <SvgXml xml={avatarXml(character)} width={inner} height={inner} />
      </View>
    </View>
  );
});

const CROWN = crownXml();

/**
 * "Lv N" in the level's own colour, with a crown instead of the star on the top
 * level. It pops when the level changes, never when it first shows. Tapping it
 * opens the level map.
 */
const LevelPill = memo(function LevelPill({ level, onPress }: { level: number; onPress?: () => void }) {
  const t = useTranslation();
  const [pop] = useState(() => new Animated.Value(1));
  const prev = useRef(level);
  useEffect(() => {
    if (level === prev.current) return;
    prev.current = level;
    popFrom(pop, 1.35);
  }, [level, pop]);
  const c = levelColor(level);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('header.a11y.level', { level })}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.level,
            { backgroundColor: c.light, borderColor: `${c.main}80`, transform: [{ scale: pop }] },
            pressed && styles.levelPressed,
          ]}
        >
          {level >= LEVELS.length ? <Icon xml={CROWN} size={17} height={13} /> : <Icon xml={starXml(c.main)} size={15} />}
          <Text style={[styles.levelText, { color: c.dark }]}>{t('header.level', { level })}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
});

/** The daily streak on the avatar's corner: unlit while today still has to be played, popping when it lights. */
const DailyBadge = memo(function DailyBadge({ days, done }: { days: number; done: boolean }) {
  const t = useTranslation();
  const [pop] = useState(() => new Animated.Value(1));
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) popFrom(pop, 1.5);
    wasDone.current = done;
  }, [done, pop]);
  return (
    <Animated.View
      style={[styles.daily, { transform: [{ scale: pop }] }]}
      accessible
      accessibilityLabel={t(done ? 'header.a11y.daily' : 'header.a11y.dailyDue', { count: days })}
    >
      <Icon xml={flameXml(done)} size={12} />
      <Text style={[styles.dailyText, !done && styles.dailyDue]}>{days}</Text>
    </Animated.View>
  );
});

function ProfileButton({ character, badge }: { character: Character; badge?: ReactNode }) {
  const t = useTranslation();
  return (
    <Pressable
      onPress={() => { sound.unlock(); sound.play('panel-open'); router.push('/profile'); }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('header.a11y.avatar')}
      style={({ pressed }) => pressed && styles.levelPressed}
    >
      <Avatar character={character} size={46} />
      {badge}
    </Pressable>
  );
}

/** Back to where the page was opened from (Play, if it was opened straight from a link). */
const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** A pushed page's header: back button (or `onBack`, e.g. leaving a lobby), title, and the token balance when the page shows it. */
export function BackHeader({ title, tokens, onBack = goBack }: { title: string; tokens?: number; onBack?: () => void }) {
  const t = useTranslation();
  return (
    <View style={styles.head}>
      <Pressable onPress={() => { sound.play('back'); onBack(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('profile.back')}>
        {({ pressed }) => (
          <Raised depth={3} shadowColor={colors.shadow} radius={15} pressed={pressed} style={styles.back}>
            <Icon xml={chevXml('l')} size={22} />
          </Raised>
        )}
      </Pressable>
      <Text style={[styles.title, styles.backTitle]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {tokens === undefined ? <View style={styles.backSpacer} /> : <StillTokenPill tokens={tokens} />}
    </View>
  );
}

export function TitleHeader({ title, character, tokens, live }: { title: string; character: Character; tokens: number; live?: boolean }) {
  return (
    <View style={styles.head}>
      <ProfileButton character={character} />
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {live ? <TokenPill tokens={tokens} /> : <StillTokenPill tokens={tokens} />}
    </View>
  );
}

/** Fredoka Bold's letters average about this much of the font size in width (wide ones, W and M, more). */
const LETTER_WIDTH = 0.62;

/**
 * The name's size in the game header: as big as fits the space beside the
 * level and tokens, 27 at most and 14 at least. A 15-character name (NAME_MAX)
 * fits on a small iPhone; one of very wide letters is cut with "…".
 */
const nameSize = (name: string, width: number) =>
  Math.max(14, Math.min(27, Math.floor(width / ([...name].length * LETTER_WIDTH))));

export function GameHeader({ name, character, wordsGuessed, level, tokens, dailyDays, dailyDone, onLevelPress }: Props) {
  const t = useTranslation();
  // The name's room, measured: it changes with the phone and with the pills' widths
  const [nameWidth, setNameWidth] = useState(0);
  return (
    <View style={styles.head}>
      <View style={[styles.side, styles.grow]}>
        <ProfileButton character={character} badge={dailyDays > 0 && <DailyBadge days={dailyDays} done={dailyDone} />} />
        <View style={styles.nameBlock} onLayout={(e) => setNameWidth(e.nativeEvent.layout.width)}>
          <Text style={[styles.name, nameWidth > 0 && { fontSize: nameSize(name, nameWidth) }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.sub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {wordsGuessed === 1 ? t('header.wordGuessed') : t('header.wordsGuessed', { count: wordsGuessed })}
          </Text>
        </View>
      </View>
      <View style={[styles.side, styles.fixed]}>
        <LevelPill level={level} onPress={onLevelPress} />
        <TokenPill tokens={tokens} />
      </View>
    </View>
  );
}

/** The white line between an avatar's ring and its picture. */
const AVATAR_BORDER = 3;

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
  // The level and tokens never shrink: the name gives way (and is cut with "…" if it's very wide)
  fixed: { flexShrink: 0 },
  grow: { flex: 1, marginRight: 9 },
  nameBlock: { flex: 1 },
  // backgroundColor: the character's ring colour (avatarRing)
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3a2b4d',
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  avatarPlain: { shadowOpacity: 0 },
  avatar: { borderWidth: AVATAR_BORDER, borderColor: '#fff', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontFamily: fonts.display700, fontSize: 27, lineHeight: 30, color: colors.ink },
  title: { flexShrink: 1, fontFamily: fonts.display700, fontSize: 25, color: colors.ink },
  back: {
    width: 44,
    height: 41,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTitle: { flex: 1, textAlign: 'center', marginHorizontal: 8 },
  backSpacer: { width: 44 },
  sub: { fontFamily: fonts.body800, fontSize: 11.5, color: colors.muted, marginTop: 1, letterSpacing: 0.2 },
  daily: {
    position: 'absolute',
    right: -7,
    bottom: -5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    height: 19,
    paddingLeft: 3,
    paddingRight: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
  dailyText: { fontFamily: fonts.display700, fontSize: 12, lineHeight: 15, color: colors.flameT },
  dailyDue: { color: colors.muted },
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
  levelPressed: { opacity: 0.7 },
  levelText: { fontFamily: fonts.display600, fontSize: 14 },
});
