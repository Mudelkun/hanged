/*
 * The daily streak (owner's request, 2026-10-24): calendar days in a row on
 * which the player finished at least one solo round, won or lost. Not the
 * same as GameState.streak, the words guessed in a row that pay a token bonus.
 *
 * Pure, like the rest of src/game: days are the device's local calendar days,
 * from an epoch-ms time the caller passes in. The daily reminder's plan lives
 * here too, so its rules are tested; src/state/useReminders.ts only schedules it.
 */
import { REMINDER_DAYS, REMINDER_HOUR } from './config';

const DAY_MS = 86_400_000;

export interface DailyStreak {
  /** Days in a row, as of `lastDay`. The streak the player sees comes from dailyDays (it may have broken since). */
  days: number;
  /** The dayNumber of the last day a round was finished, or null before the first one. */
  lastDay: number | null;
  /** The longest run ever. */
  best: number;
}

export const NO_DAILY_STREAK: DailyStreak = { days: 0, lastDay: null, best: 0 };

/** Days since 1970-01-01 in the device's local calendar, so the next day is always +1 (summer time or not). */
export const dayNumber = (at: number) => {
  const d = new Date(at);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
};

/**
 * The streak once a round is finished on `day`: +1 the day after the last
 * one, back to 1 after a missed day. The same object when `day` already
 * counted, or is before it (the clock was moved back).
 */
export function playedOn(s: DailyStreak, day: number): DailyStreak {
  if (s.lastDay !== null && day <= s.lastDay) return s;
  const days = s.lastDay === day - 1 ? s.days + 1 : 1;
  return { days, lastDay: day, best: Math.max(s.best, days) };
}

/**
 * done: today already counts. due: the streak is alive and today keeps it
 * going. none: no streak running (never played, or a day was missed).
 */
export type DailyStatus = 'done' | 'due' | 'none';

export function dailyStatus(s: DailyStreak, today: number): DailyStatus {
  if (s.lastDay === null || s.days === 0) return 'none';
  if (s.lastDay >= today) return 'done';
  return s.lastDay === today - 1 ? 'due' : 'none';
}

/** The streak as the player sees it on `today`: 0 once a day was missed. */
export const dailyDays = (s: DailyStreak, today: number) => (dailyStatus(s, today) === 'none' ? 0 : s.days);

export interface Reminder {
  /** When it shows, epoch ms: REMINDER_HOUR on its day. */
  at: number;
  /** The streak it asks to keep (0: the streak has broken by then). */
  keep: number;
  /** Days missed by then: 0 on the day after the last one played. */
  missed: number;
}

/**
 * The reminders to schedule from `now`: one a day at REMINDER_HOUR, never on
 * a day that already counts, for REMINDER_DAYS after the last day played,
 * then nothing (no nagging a player who has left). Nothing before the first
 * round is finished. Playing again re-plans from the new last day.
 */
export function reminderPlan(s: DailyStreak, now: number): Reminder[] {
  if (s.lastDay === null) return [];
  const today = dayNumber(now);
  const d = new Date(now);
  const plan: Reminder[] = [];
  for (let day = Math.max(today, s.lastDay + 1); day <= s.lastDay + REMINDER_DAYS; day++) {
    // Local midnight math, not + DAY_MS: a summer-time day is 23 or 25 hours long.
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (day - today), REMINDER_HOUR).getTime();
    if (at <= now) continue;
    const missed = day - s.lastDay - 1;
    plan.push({ at, keep: missed === 0 ? s.days : 0, missed });
  }
  return plan;
}
