// The browser preview has no local notifications: Profile hides the switch and nothing is asked.
import type { ScheduledReminder } from './reminders';

export type { ScheduledReminder };

export const remindersSupported = false;

export const allowReminders = async (): Promise<boolean> => false;

export const scheduleReminders = async (_list: ScheduledReminder[]): Promise<void> => {};
