/*
 * Feel for each game event. Haptics only for now; sound effects and music
 * (CLAUDE.md: "filled with sound effects") plug in here once there are assets.
 */
import * as Haptics from 'expo-haptics';

const safe = (p: Promise<void>) => p.catch(() => {});

// Key presses deliberately don't buzz: the owner found a vibration on every
// letter annoying. Only round events (won, lost, stamp, unlock) are felt.
export const feedback = {
  won: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  lost: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  stamp: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  unlock: () => safe(Haptics.selectionAsync()),
  levelUp: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  levelDown: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  streak: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  streakBonus: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  refused: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
