/*
 * The daily streak's two hooks: `useToday` (the local day, kept current
 * across midnight and coming back to the app) and `useReminders`, which keeps
 * the OS's scheduled reminders matching the save (daily.reminderPlan). The
 * rules are in src/game/daily.ts; this only adds the clock and the OS.
 */
import { Dispatch, useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { characterById } from '../characters/rig';
import { dayNumber, Reminder, reminderPlan } from '../game/daily';
import { GameAction, GameState } from '../game/progress';
import { t, TranslationKey } from '../i18n';
import { allowReminders, scheduleReminders, ScheduledReminder } from '../notify/reminders';

/** Comeback messages (reminder.back0…), one a day in turn once the streak has broken. */
const BACK_VARIANTS = 3;

/** Today's dayNumber, re-read at local midnight and whenever the app comes back. */
export function useToday() {
  const [today, setToday] = useState(() => dayNumber(Date.now()));
  useEffect(() => {
    const check = () => setToday(dayNumber(Date.now()));
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    const now = new Date();
    const id = setTimeout(check, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 1000);
    return () => { sub.remove(); clearTimeout(id); };
  }, [today]);
  return today;
}

function reminderText(r: Reminder, name: string): ScheduledReminder {
  const key = r.missed > 0 ? `back${(r.missed - 1) % BACK_VARIANTS}` : r.keep > 1 ? 'keep' : 'start';
  const params = { days: r.keep, name };
  return {
    at: r.at,
    title: t(`reminder.${key}.title` as TranslationKey, params),
    body: t(`reminder.${key}.body` as TranslationKey, params),
  };
}

/**
 * Re-plans the reminders whenever what they say changes (the streak, the
 * answer, the language, the character), and on coming back to the app, in
 * case the OS permission was granted in Settings meanwhile. Returns
 * `setReminders`: true asks the OS first, and saves the answer it gives.
 */
export function useReminders(state: GameState, ready: boolean, dispatch: Dispatch<GameAction>) {
  const { daily, reminders, language, characterId } = state;
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setWake((n) => n + 1));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!ready) return;
    const name = characterById(characterId).name;
    void scheduleReminders(reminders ? reminderPlan(daily, Date.now()).map((r) => reminderText(r, name)) : []);
  }, [ready, daily, reminders, language, characterId, wake]);

  return useCallback(async (enabled: boolean) => {
    const on = enabled && (await allowReminders());
    dispatch({ type: 'reminders', enabled: on });
    return on;
  }, [dispatch]);
}
