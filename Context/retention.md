# Retention: the daily streak and the daily reminder

Owner's request (2026-10-24): give players a reason to open the app every day, with a **daily streak**
and **one notification a day** that encourages without annoying.

Rules: [src/game/daily.ts](../src/game/daily.ts) (pure, tested in
[daily.test.ts](../src/game/__tests__/daily.test.ts)). Clock and OS: [src/state/useDaily.ts](../src/state/useDaily.ts)
(`useToday`, `useReminders`). The only code that talks to the OS: [src/notify/reminders.ts](../src/notify/reminders.ts)
(and `reminders.web.ts`, which does nothing). Tuning: `REMINDER_HOUR`, `REMINDER_DAYS` in
[config.ts](../src/game/config.ts), both PLACEHOLDER.

## The daily streak

- **A day counts when the player finishes a solo round on it, won or lost.** Showing up is what it
  rewards; a lost word mustn't cost a streak. Opening the app alone doesn't count (the owner's words:
  "opens the app and plays at least one game"). Versus doesn't count yet: it lives on the server.
- **Not the same streak as `GameState.streak`** (words guessed in a row, which pays the token bonus).
  The UI always says "daily streak" / "days in a row" for this one, with the flame icon; the other one
  is "N in a row" with the streak takeover.
- Days are the **device's local calendar days**: `dayNumber(at)` = days since 1970-01-01 of the local
  date, so the next day is always +1, summer time or not. The tests run in any time zone (they were
  checked in Paris, New York and Auckland around the 2026-10-25 clock change).
- **Counted in the reducer's `guess` step that finishes the round** (`playedOn(daily, dayNumber(at))`),
  like scoring, so it can't count twice. `playedOn`: the day after the last one +1, a later day back to 1,
  the same or an earlier day (clock moved back) changes nothing.
- Saved: `daily` (`days`, `lastDay`, `best`) and `dailyCountedBy` (the id of the round that counted
  `lastDay`, so its result can say so). Old saves get `NO_DAILY_STREAK` from `initialState()`; a
  malformed `daily` is reset by `hydrate`. Same key, no bump.
- **The saved `days` isn't what the player sees**: a streak breaks on a day nobody plays, and nothing
  runs then. `dailyStatus(daily, today)` says `done` (today counts), `due` (played yesterday: today keeps
  it) or `none`; `dailyDays` is 0 for `none`. Screens get `today` from `useToday()`, which re-reads it at
  local midnight and when the app comes back (never `Date.now()` during render: React Compiler lint).
- **No reward, no freeze (yet).** Paying tokens for a streak or selling a "streak freeze" would change
  the economy, and the owner's rules say tokens are spent on exactly two things: ask first.

Where it shows:
- **Play header**: a small white pill on the avatar's corner, flame + days. Grey while today is `due`,
  lit (and popping) once today counts. Hidden at 0. On the avatar, not beside "N words guessed": there it
  cut that line to "42 words gues…" on a 375 pt phone. Tapping the avatar opens Profile, where the card is.
- **Result**: the round that counted the day adds "N days in a row! See you tomorrow." (day 1: "Day 1 of
  your daily streak!") under the misses line, in flame orange.
- **Profile**: the daily streak card under the stats: flame, days, best, and what today needs.
- **Game rules**: the "Daily streak" card.

## The daily reminder

- **Local notifications only**, planned and scheduled by the device (offline first): no push server,
  no push token, no APNs entitlement (`enableRemoteNotifications: false` in app.json). They work in
  Expo Go. A development build made before `expo-notifications` was added must be rebuilt.
- **The plan** (`reminderPlan(daily, now)`): one reminder a day at `REMINDER_HOUR` (18:00 local),
  **never on a day that already counts**, from the day after the last one played for `REMINDER_DAYS` (7)
  days, **then silence**: a player who left isn't nagged forever. Nothing before the first finished round.
  - The day after the last one played asks to keep the streak: "Your 4-day streak ends at midnight"
    (with a 1-day streak: "Day 2 is waiting").
  - After that the streak has broken, so it never says it's at risk: three comeback messages take turns
    (`reminder.back0..2`), using the character's name.
- `useReminders` replaces every scheduled reminder (cancel all, schedule the plan) whenever the
  streak, the answer, the language or the character changes, and when the app comes back (the OS
  permission may have been granted in Settings meanwhile). Calls are queued, so two quick re-plans
  can't interleave and leave duplicates. Failures are swallowed: a reminder never blocks play.
- A notification arriving while the app is open isn't shown (no foreground handler): the player is
  already here.

### Asking (iOS asks only once)

- Saved `reminders`: `null` (never asked), then the player's answer.
- **The app asks first, with its own sheet** (`ReminderSheet`: "Keep your streak going?"), over the
  result of the **first won round**, once nothing else plays over it (level-up card, streak takeover),
  1.4 s after the stamp. Only "Remind me" triggers the OS prompt, so a "Not now" doesn't burn iOS's single ask.
  Closing the sheet counts as "Not now" (`false`).
- **Profile → Settings → Daily reminder** changes the answer. Turning it on asks the OS; if the OS
  won't ask again (denied before), it opens the app's Settings page and the switch stays off.
- The web preview has no local notifications: `remindersSupported` is false there, the switch is
  hidden and nothing is asked.
- `reset` (account deleted) clears everything, so the reminders are cancelled with it.

## Ideas not built (for the owner)

See the list given with this work (2026-10-24): a daily word (the same word for everyone, every day),
daily quests, a streak reward or a streak freeze bought with tokens, a weekly leaderboard reset, and a
first-win-of-the-day bonus. Anything that pays or spends tokens needs the owner's call first.
