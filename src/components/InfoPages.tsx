/*
 * The info & legal pages opened from Profile (route: src/app/info/[page].tsx).
 * Game rules explain CLAUDE.md's rules in player words, with the numbers read
 * from the game's config so they never drift from the real rules. Credits are
 * required by the word lists' licences (data/CREDITS.md). Support opens an
 * email. The privacy policy and terms of use ship inside the app (so they read
 * offline) and are also shown in onboarding's consent sheet.
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_MAX_WRONG, LETTER_BUY_COST, LETTER_BUY_COUNT, LOSSES_TO_DROP, STREAK_BONUS_AT } from '../game/config';
import { LEVELS } from '../game/levels';
import { LEGAL_VERSION } from '../game/onboarding';
import { Translator, TranslationKey, useTranslation } from '../i18n';
import { sound } from '../audio';
import { colors, fonts } from '../theme';
import { profileIconXml } from './icons';
import { Raised } from './Raised';
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
export const SUPPORT_EMAIL = 'mudelkun56@gmail.com';
const supportLink = (t: Translator) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('support.email.subject'))}`;

/**
 * The legal pages' sections, in order: `legal.<page>.<section>.title` and `.body` in en.json. The texts build
 * on the Basecamp open-source policies (CC BY 4.0: hence `legal.credit` and its links) and Apple's standard
 * app license; Context/profile.md says what each section rests on. Changing any of it means a new LEGAL_VERSION.
 */
export type LegalPage = 'privacy' | 'terms';
const LEGAL: Record<LegalPage, string[]> = {
  privacy: ['who', 'device', 'collect', 'versus', 'public', 'never', 'permissions', 'share', 'bases', 'keep', 'delete', 'rights', 'security', 'transfers', 'children', 'changes', 'contact'],
  terms: ['agree', 'license', 'account', 'fair', 'name', 'tokens', 'online', 'content', 'changes', 'ending', 'warranty', 'liability', 'stores', 'general', 'contact'],
};
const LEGAL_LINKS: Record<string, string[]> = { stores: ['https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'] };
const LEGAL_CREDIT_LINKS = ['https://github.com/basecamp/policies', 'https://creativecommons.org/licenses/by/4.0/'];

/** LEGAL_VERSION is the date the texts took effect, written out in the player's language. */
const legalDate = (language: string) => {
  const [year, month, day] = LEGAL_VERSION.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' });
};

const CREDITS: { key: string; links: string[] }[] = [
  { key: 'original', links: [] },
  { key: 'wordnet', links: ['https://en-word.net', 'https://creativecommons.org/licenses/by/4.0/'] },
  { key: 'scowl', links: ['http://wordlist.aspell.net'] },
  { key: 'princeton', links: ['https://wordnet.princeton.edu/license-and-commercial-use'] },
];

function Link({ url }: { url: string }) {
  return (
    <Pressable onPress={() => { sound.play('link'); Linking.openURL(url).catch(() => {}); }} accessibilityRole="link" hitSlop={4}>
      <Text style={styles.link}>{url.replace(/^(https?:\/\/|mailto:)/, '').replace(/\?.*$/, '')}</Text>
    </Pressable>
  );
}

/** One paragraph per line; a line starting with "• " is a bullet with a hanging indent. */
function Body({ text }: { text: string }) {
  return text.split('\n').map((line, i) => line.startsWith('• ') ? (
    <View key={i} style={styles.bullet}>
      <Text style={styles.cardBody} accessibilityElementsHidden importantForAccessibility="no">•</Text>
      <Text style={[styles.cardBody, styles.bulletText]}>{line.slice(2)}</Text>
    </View>
  ) : (
    <Text key={i} style={[styles.cardBody, i > 0 && styles.paragraph]}>{line}</Text>
  ));
}

function InfoCard({ title, body, color, links }: { title: string; body: string; color: string; links?: string[] }) {
  return (
    <Raised depth={3} shadowColor={colors.shadow} radius={20} outerStyle={styles.cardOuter} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.cardTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Body text={body} />
      {links?.map((url) => <Link key={url} url={url} />)}
    </Raised>
  );
}

export function InfoContent({ page }: { page: InfoPage }) {
  const t = useTranslation();
  const text = (key: string, params?: Record<string, number>) => t(key as TranslationKey, params);
  switch (page) {
    case 'terms':
    case 'privacy':
      return (
        <>
          <Text style={styles.intro}>{text(`legal.${page}.summary`)}</Text>
          <Text style={styles.updated}>{t('legal.updated', { date: legalDate(t.language) })}</Text>
          {LEGAL[page].map((key) => (
            <InfoCard key={key} color={INFO_PAGES[page].color} title={text(`legal.${page}.${key}.title`)} body={text(`legal.${page}.${key}.body`)}
              links={key === 'contact' ? [supportLink(t)] : LEGAL_LINKS[key]} />
          ))}
          <View style={styles.credit}>
            <Text style={styles.creditText}>{t('legal.credit')}</Text>
            {LEGAL_CREDIT_LINKS.map((url) => <Link key={url} url={url} />)}
          </View>
        </>
      );
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
          <InfoCard color={INFO_PAGES.support.color} title={t('support.email.title')} body={t('support.email.body')} links={[supportLink(t)]} />
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
  paragraph: { marginTop: 6 },
  bullet: { flexDirection: 'row', gap: 7, marginTop: 4 },
  bulletText: { flex: 1 },
  link: { fontFamily: fonts.display600, fontSize: 13.5, color: colors.skyT, marginTop: 6 },
  intro: { fontFamily: fonts.body700, fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center', marginHorizontal: 8, marginBottom: 14 },
  updated: { fontFamily: fonts.body800, fontSize: 12.5, color: colors.muted, textAlign: 'center', marginTop: -8, marginBottom: 14 },
  credit: { alignItems: 'center', marginHorizontal: 8, marginTop: 2, marginBottom: 8 },
  creditText: { fontFamily: fonts.body700, fontSize: 12.5, lineHeight: 17, color: colors.muted, textAlign: 'center' },
});
