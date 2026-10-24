/*
 * The only code that talks to the OS about notifications. Local ones only:
 * the device plans and schedules the daily reminder itself (offline first),
 * so there is no push server and no APNs entitlement (app.json). The web
 * build gets reminders.web.ts, which does nothing.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { t } from '../i18n';

export const remindersSupported = true;

const CHANNEL = 'daily-reminder';

export interface ScheduledReminder {
  at: number;
  title: string;
  body: string;
}

const granted = (p: Notifications.NotificationPermissionsStatus) =>
  p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL;

/**
 * Asks the OS for permission, once the player said yes in the app. When the
 * OS won't ask again (they said no to it before), opens the app's settings
 * instead. Resolves true only if reminders can show now.
 */
export async function allowReminders(): Promise<boolean> {
  try {
    // Android 13+ asks only once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: t('profile.reminders'), importance: AndroidImportance.DEFAULT });
    }
    const current = await Notifications.getPermissionsAsync();
    if (granted(current)) return true;
    if (!current.canAskAgain) {
      await Linking.openSettings();
      return false;
    }
    return granted(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  } catch {
    return false;
  }
}

let queue = Promise.resolve();

/**
 * Replaces every scheduled reminder with `list`. Nothing is scheduled without
 * the OS permission. Calls run one after the other, so two quick re-plans
 * can't interleave their cancel and schedule steps and leave duplicates.
 */
export function scheduleReminders(list: ScheduledReminder[]): Promise<void> {
  queue = queue.then(() => replaceAll(list));
  return queue;
}

async function replaceAll(list: ScheduledReminder[]) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!list.length || !granted(await Notifications.getPermissionsAsync())) return;
    for (const r of list) {
      await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
      });
    }
  } catch {
    // A reminder that can't be scheduled is only a missed nudge: play never waits on it.
  }
}
