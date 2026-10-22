/*
 * The bottom-tab screens. The navigator draws no tab bar: each screen draws
 * the mockup's TabBar itself, so a full-screen overlay (the level path) can
 * cover it. Screens stay mounted when you switch, and frozen while hidden,
 * so Play keeps its round and stops animating behind the Leaderboard.
 */
import { Tabs } from 'expo-router';

import { colors } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{ headerShown: false, freezeOnBlur: true, sceneStyle: { backgroundColor: colors.paper } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="leaderboard" />
    </Tabs>
  );
}
