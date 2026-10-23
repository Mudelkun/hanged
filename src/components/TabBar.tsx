/*
 * The floating bottom tab bar from the mockup. At most 4 tabs, ever:
 * Play · Versus · Leaderboard · Characters (Profile opens from the avatar).
 * A tab without a route is drawn but not pressable. The routes are the
 * (tabs) group's screens (src/app/(tabs)/_layout.tsx).
 */
import { Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TranslationKey, useTranslation } from '../i18n';
import { colors, fonts } from '../theme';
import { Icon, tabIconXml } from './icons';
import { sound } from '../audio';

type TabId = keyof typeof tabIconXml;

const TABS: { id: TabId; label: TranslationKey; href?: Href }[] = [
  { id: 'play', label: 'tabs.play', href: '/' },
  { id: 'versus', label: 'tabs.versus', href: '/versus' },
  { id: 'leaderboard', label: 'tabs.leaderboard', href: '/leaderboard' },
  { id: 'characters', label: 'tabs.characters', href: '/characters' },
];

export function TabBar({ active, compact }: { active: TabId; compact: boolean }) {
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { height: compact ? 60 : 68, marginBottom: Math.max(insets.bottom - 8, 10) }]}>
      {TABS.map((tab) => {
        const on = tab.id === active;
        const { href } = tab;
        return (
          <Pressable
            key={tab.id}
            style={styles.tab}
            disabled={!href || on}
            onPress={href ? () => { sound.unlock(); sound.play('tab'); router.navigate(href); } : undefined}
            accessibilityRole="tab"
            accessibilityLabel={href ? t(tab.label) : `${t(tab.label)}, ${t('tabs.comingSoon')}`}
            accessibilityState={{ selected: on, disabled: !href }}
          >
            <View style={[styles.iconBox, on && { backgroundColor: colors.coralL }]}>
              <Icon xml={tabIconXml[tab.id](on ? colors.coral : colors.tabIdle)} size={28} height={24} />
            </View>
            <Text style={[styles.label, on && { color: colors.coralD }]}>{t(tab.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginTop: 6,
    marginHorizontal: 12,
    borderRadius: 26,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 6,
    shadowColor: 'rgb(150,95,50)',
    shadowOpacity: 0.3,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 10 },
  },
  tab: { width: 80, alignItems: 'center', gap: 2 },
  iconBox: { width: 50, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.display600, fontSize: 12, color: colors.tabLabel },
});
