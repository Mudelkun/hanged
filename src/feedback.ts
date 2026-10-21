/*
 * Feel for each game event. Haptics only for now; sound effects and music
 * (CLAUDE.md: "filled with sound effects") plug in here once there are assets.
 */
import * as Haptics from 'expo-haptics';

const safe = (p: Promise<void>) => p.catch(() => {});

export const feedback = {
  correct: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  wrong: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  won: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  lost: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  stamp: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  unlock: () => safe(Haptics.selectionAsync()),
  refused: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
