import { REMINDER_DAYS, REMINDER_HOUR } from '../config';
import { dailyDays, dailyStatus, dayNumber, DailyStreak, NO_DAILY_STREAK, playedOn, reminderPlan } from '../daily';
import { decoyLetters, usedLetters } from '../engine';
import { gameReducer, GameState, initialState } from '../progress';

/** A local time: tests pass in any time zone. */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const day = (d: number) => dayNumber(at(d));

const word = {
  id: 'en-castle', word: 'castle', language: 'en', description: 'A big stone home for a king.',
  sense: 'oewn-02983900-n', rarity: 10, concrete: true, difficulty: 1, subject: 'object',
};

function finishRound(s: GameState, when: number, id = `r${when}`, won = true): GameState {
  let state = gameReducer(s, { type: 'newRound', word, roundId: id, rng: () => 0 });
  const letters = won ? [...'castle'] : decoyLetters(word.word).filter((c) => !usedLetters(state.round!).has(c));
  for (const c of letters) state = gameReducer(state, { type: 'guess', letter: c, at: when });
  return state;
}

describe('dayNumber', () => {
  test('counts local calendar days: midnight starts the next one', () => {
    expect(day(25) - day(24)).toBe(1);
    expect(dayNumber(at(24, 23, 59))).toBe(day(24));
    expect(dayNumber(at(25, 0, 0))).toBe(day(25));
  });

  test('a summer-time change is still one day', () => {
    // Europe moves its clocks on 2026-10-25 and the US on 2026-11-01: whichever applies here, days stay +1.
    for (let d = 20; d < 40; d++) expect(dayNumber(new Date(2026, 9, d + 1).getTime()) - dayNumber(new Date(2026, 9, d).getTime())).toBe(1);
  });
});

describe('playedOn', () => {
  test('the first day starts at 1, the next day adds one, a missed day starts over', () => {
    let s = playedOn(NO_DAILY_STREAK, day(1));
    expect(s).toEqual({ days: 1, lastDay: day(1), best: 1 });
    s = playedOn(s, day(2));
    s = playedOn(s, day(3));
    expect(s.days).toBe(3);
    s = playedOn(s, day(5));
    expect(s).toEqual({ days: 1, lastDay: day(5), best: 3 });
  });

  test('a day counts once, and a clock moved back changes nothing', () => {
    const s = playedOn(NO_DAILY_STREAK, day(10));
    expect(playedOn(s, day(10))).toBe(s);
    expect(playedOn(s, day(8))).toBe(s);
  });
});

describe('dailyStatus and dailyDays', () => {
  const s: DailyStreak = { days: 4, lastDay: day(10), best: 6 };
  test('done today, due tomorrow, broken after a missed day', () => {
    expect(dailyStatus(s, day(10))).toBe('done');
    expect(dailyStatus(s, day(11))).toBe('due');
    expect(dailyStatus(s, day(12))).toBe('none');
    expect([10, 11, 12].map((d) => dailyDays(s, day(d)))).toEqual([4, 4, 0]);
  });

  test('never played is no streak', () => {
    expect(dailyStatus(NO_DAILY_STREAK, day(10))).toBe('none');
    expect(dailyDays(NO_DAILY_STREAK, day(10))).toBe(0);
  });
});

describe('reminderPlan', () => {
  const s: DailyStreak = { days: 4, lastDay: day(10), best: 4 };

  test('nothing before the first finished round', () => {
    expect(reminderPlan(NO_DAILY_STREAK, at(10))).toEqual([]);
  });

  test('one a day at the reminder hour, never on a day that counts, then quiet', () => {
    const plan = reminderPlan(s, at(10, 9));
    expect(plan).toHaveLength(REMINDER_DAYS);
    plan.forEach((r, i) => {
      const when = new Date(r.at);
      expect(dayNumber(r.at)).toBe(day(11 + i));
      expect([when.getHours(), when.getMinutes()]).toEqual([REMINDER_HOUR, 0]);
      expect(r.missed).toBe(i);
    });
    // The day after asks to keep the streak; from the day after that, it has broken.
    expect(plan.map((r) => r.keep)).toEqual([4, ...Array(REMINDER_DAYS - 1).fill(0)]);
  });

  test("today's reminder only while it is still ahead, and only if today hasn't counted", () => {
    expect(dayNumber(reminderPlan(s, at(11, REMINDER_HOUR - 1))[0].at)).toBe(day(11));
    expect(dayNumber(reminderPlan(s, at(11, REMINDER_HOUR, 1))[0].at)).toBe(day(12));
    // Coming back after days away: what's left of the window, starting today.
    const late = reminderPlan(s, at(14, 8));
    expect(late[0]).toMatchObject({ keep: 0, missed: 3 });
    expect(late).toHaveLength(REMINDER_DAYS - 3);
    expect(reminderPlan(s, at(10 + REMINDER_DAYS + 1))).toEqual([]);
  });
});

describe('the reducer counts the day in the step that finishes a round', () => {
  test('won or lost, the first finished round of the day counts it, and says which round did', () => {
    let s = finishRound(initialState(), at(1), 'a');
    expect(s.daily).toEqual({ days: 1, lastDay: day(1), best: 1 });
    expect(s.dailyCountedBy).toBe('a');
    s = finishRound(s, at(1, 18), 'b');
    expect(s.daily.days).toBe(1);
    expect(s.dailyCountedBy).toBe('a');
    s = finishRound(s, at(2), 'c', false);
    expect(s.round!.id).toBe('c');
    expect(s.daily.days).toBe(2);
    expect(s.dailyCountedBy).toBe('c');
  });

  test('a guess that does not finish the round counts nothing', () => {
    let s = gameReducer(initialState(), { type: 'newRound', word, roundId: 'r', rng: () => 0 });
    s = gameReducer(s, { type: 'guess', letter: 'z', at: at(1) });
    expect(s.daily).toBe(NO_DAILY_STREAK);
    expect(s.dailyCountedBy).toBeNull();
  });

  test('an older save gets no streak and an unasked reminder; a bad one is repaired', () => {
    const { daily, dailyCountedBy, reminders, ...old } = initialState();
    const s = gameReducer(initialState(), { type: 'hydrate', state: { ...old, onboardingCompleted: true } as GameState });
    expect([s.daily, s.dailyCountedBy, s.reminders]).toEqual([NO_DAILY_STREAK, null, null]);
    const bad = gameReducer(initialState(), { type: 'hydrate', state: { ...initialState(), daily: { days: '3' } as unknown as DailyStreak } });
    expect(bad.daily).toBe(NO_DAILY_STREAK);
  });

  test('the reminder answer is saved, and a reset forgets it', () => {
    const on = gameReducer(initialState(), { type: 'reminders', enabled: true });
    expect(on.reminders).toBe(true);
    expect(gameReducer(on, { type: 'reminders', enabled: true })).toBe(on);
    expect(gameReducer(on, { type: 'reset' }).reminders).toBeNull();
  });
});
