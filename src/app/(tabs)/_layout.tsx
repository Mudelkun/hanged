/*
 * The bottom-tab screens. The navigator draws no tab bar: each screen draws
 * the mockup's TabBar itself, so a full-screen overlay (the level path) can
 * cover it. Screens stay mounted when you switch, so Play keeps its round;
 * each animation loop stops itself while its tab is hidden (useIsFocused).
 * Not `activityEnabled`: it re-runs mount effects when a tab comes back,
 * which would replay the streak, token flight and level card sounds.
 */
import { Tabs } from 'expo-router';

import { colors } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="characters" />
    </Tabs>
  );
}
