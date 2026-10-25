/*
 * The info & legal pages opened from Profile (route: src/app/info/[page].tsx).
 * Game rules explain CLAUDE.md's rules in player words, with the numbers read
 * from the game's config so they never drift from the real rules. Credits are
 * required by the word lists' licences (data/CREDITS.md). Support names the
 * developer and opens an email. Privacy policy and terms of use are still to be
 * written (owner's call) and share onboarding's explicit draft placeholder.
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_MAX_WRONG, LETTER_BUY_COST, LETTER_BUY_COUNT, LOSSES_TO_DROP, STREAK_BONUS_AT } from '../game/config';
import { LEVELS } from '../game/levels';
import { TranslationKey, useTranslation } from '../i18n';
import { sound } from '../audio';
import { colors, fonts } from '../theme';
import { profileIconXml } from './icons';
import { Raised } from './Raised';
import { LegalDocument } from './LegalDocument';
import en from '../i18n/en.json';

export const INFO_PAGES = {
  rules: { title: 'profile.rules', icon: profileIconXml.rules, color: '#5fd3a5' },
  privacy: { title: 'profile.privacy', icon: profileIconXml.privacy, color: '#7fb8f0' },
  terms: { title: 'profile.terms', icon: profileIconXml.terms, color: '#9ad3f3' },
  support: { title: 'profile.support', icon: profileIconXml.support, color: '#ff8fb6' },
  // Not in the mockup: the WordNet licence needs the credits shown to players.
  credits: { title: 'profile.credits', icon: profileIconXml.credits, color: '#ffc23d' },
} as const satisfies Record<string, { title: TranslationKey; icon: string; color: string }>;

export type InfoPage = keyof typeof INFO_PAGES;

export const isInfoPage = (page: unknown): page is InfoPage => typeof page === 'string' && page in INFO_PAGES;

/** The first level where `has` is true. */
const firstLevel = (has: (l: (typeof LEVELS)[number]) => boolean) => LEVELS.find(has)?.level ?? LEVELS.length;

const RULES: { key: string; color: string; params?: () => Record<string, number> }[] = [
  { key: 'goal', color: colors.sky, params: () => ({ max: DEFAULT_MAX_WRONG }) },
  { key: 'guess', color: colors.mint },
  { key: 'accents', color: colors.sky },
  { key: 'help', color: colors.butterD },
  {
    key: 'hard',
    color: '#a98bf5',
    params: () => ({
      lettersLevel: firstLevel((l) => l.sellsLetters),
      letterCount: LETTER_BUY_COUNT,
      letterCost: LETTER_BUY_COST,
      subjectLevel: firstLevel((l) => l.showsSubject),
    }),
  },
  { key: 'tokens', color: colors.butterD, params: () => ({ streak: STREAK_BONUS_AT[0] }) },
  { key: 'levels', color: colors.coral, params: () => ({ levels: LEVELS.length, drop: LOSSES_TO_DROP }) },
  { key: 'board', color: '#e45a92' },
  { key: 'daily', color: '#ff8a3d' },
  { key: 'versus', color: '#a98bf5' },
];

/** Who players reach from Contact & support (owner, 2026-10-25). */
export const SUPPORT = { developer: 'Rodarly', email: 'mudelkun56@gmail.com' } as const;

const CREDITS: { key: string; links: string[] }[] = [
  { key: 'original', links: [] },
  { key: 'wordnet', links: ['https://en-word.net', 'https://creativecommons.org/licenses/by/4.0/'] },
  { key: 'scowl', links: ['http://wordlist.aspell.net'] },
  { key: 'princeton', links: ['https://wordnet.princeton.edu/license-and-commercial-use'] },
];

function InfoCard({ title, body, color, links }: { title: string; body: string; color: string; links?: string[] }) {
  return (
    <Raised depth={3} shadowColor={colors.shadow} radius={20} outerStyle={styles.cardOuter} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.cardTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Text style={styles.cardBody}>{body}</Text>
      {links?.map((url) => (
        <Pressable key={url} onPress={() => { sound.play('link'); Linking.openURL(url).catch(() => {}); }} accessibilityRole="link" hitSlop={4}>
          <Text style={styles.link}>{url.replace(/^(https?:\/\/|mailto:)/, '').replace(/\?.*$/, '')}</Text>
        </Pressable>
      ))}
    </Raised>
  );
}

export function InfoContent({ page }: { page: InfoPage }) {
  const t = useTranslation();
  const text = (key: string, params?: Record<string, number>) => t(key as TranslationKey, params);
  switch (page) {
    case 'terms':
    case 'privacy':
      return <LegalDocument page={page} />;
    case 'rules':
      return RULES.map(({ key, color, params }) => (
        <InfoCard key={key} color={color} title={text(`rules.${key}.title`)} body={text(`rules.${key}.body`, params?.())} />
      ));
    case 'credits':
      return (
        <>
          <Text style={styles.intro}>{t('credits.intro')}</Text>
          {CREDITS.map(({ key, links }) => (
            <InfoCard key={key} color={colors.butterD} title={text(`credits.${key}.title`)} body={text(`credits.${key}.body`)} links={links} />
          ))}
          <InfoCard color={colors.butterD} title={t('credits.license')} body={en['credits.scowl.body']} />
        </>
      );
    case 'support':
      return (
        <>
          <Text style={styles.intro}>{t('support.intro')}</Text>
          <InfoCard color={INFO_PAGES.support.color} title={t('support.email.title')} body={t('support.email.body')}
            links={[`mailto:${SUPPORT.email}?subject=${encodeURIComponent(t('support.email.subject'))}`]} />
          <InfoCard color={INFO_PAGES.support.color} title={t('support.developer.title')}
            body={t('support.developer.body', { developer: SUPPORT.developer })} />
        </>
      );
  }
}

const styles = StyleSheet.create({
  cardOuter: { marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, paddingVertical: 12, paddingHorizontal: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontFamily: fonts.display700, fontSize: 17.5, color: colors.ink },
  cardBody: { fontFamily: fonts.body700, fontSize: 14.5, lineHeight: 21, color: '#6d5a52' },
  link: { fontFamily: fonts.display600, fontSize: 13.5, color: colors.skyT, marginTop: 6 },
  intro: { fontFamily: fonts.body700, fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center', marginHorizontal: 8, marginBottom: 14 },
});
