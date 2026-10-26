# Leaderboard screen and tabs

Route: [src/app/(tabs)/leaderboard.tsx](../src/app/(tabs)/leaderboard.tsx). Parts:
[src/components/Leaderboard.tsx](../src/components/Leaderboard.tsx). Data:
[src/state/useLeaderboard.ts](../src/state/useLeaderboard.ts). Server side: [server.md](server.md).
It started from the mockup's Leaderboard screen; the owner then dropped the podium (2026-10-23):
every player is a row, and the player's own row is the one that stands out.

## Ranking (owner's rules + engineering fixes)

- **The score is the number of words guessed** (CLAUDE.md). Ties, in order (owner's call, 2026-10-23):
  1. **the higher level**,
  2. **more tokens earned**: earned, **never the balance**. The owner asked for the balance; it would let
     spending (characters, letters) drop a player's rank, and CLAUDE.md says spending never lowers it.
     Tokens earned only grow, and reward winning on harder levels and keeping streaks,
  3. **fewer wrong guesses** (all rounds, won and lost),
  4. **whoever got there first** (`score_at`), then the id, so the order never flips between loads.
- **All time**: `players`: `words_guessed` (grown only by reported wins within the server's win budget, never
  the device's own count: [server.md](server.md), sync steps 2–3), the **current** level, and all-time totals.
  **This week**: `player_weeks`: wins reported since Monday 00:00 UTC, the **highest level played that
  week**, and that week's tokens earned and misses. A lost round adds a week row too (its misses), so the
  board skips rows with no word.
- Tokens earned and misses are summed **from the round reports** (each report carries the tokens it paid),
  not sent as totals. Rounds played before syncing existed, or reports dropped from a full outbox, don't
  count: it's only a tiebreak. Reports queued by an app from before 2026-10-23 have no `tokens` and count 0.
- Each order is one ascending row (`ORDER` in [leaderboard.ts](../server/src/leaderboard.ts), descending
  columns negated) that migration 003 indexes as is, so the top 50 and a player's rank both read the index.
- **Developer accounts** (unranked roles) are on neither board and have no rank; their Leaderboard says so
  ([dev-accounts.md](dev-accounts.md)).
- The **server** ranks; the device only sends its data. A player shows up once they have one word in the
  period.

## Leaderboard bots (owner's request, 2026-10-26)

"Simulate about 100 active players in the game to make the classement look alive even though it's just bots."
The owner also had the test accounts SunnyOtter4–8 (42 words each from 0 rounds: the first-sync hole closed on
2026-10-25) deleted from the live database the same day.

- **What they are**: ordinary `players` rows with `bot = true` (migration 009), made and played by
  [crowd.ts](../server/src/crowd.ts). So both boards, their indexes and a real player's rank need nothing new:
  a bot ranks, ties and fills a week exactly like a person. The app gets nothing that says "bot".
- **Who they look like**: names and characters from the Versus bots' generators (`botName`, `botCharacter`
  in [versus/bots.ts](../server/src/versus/bots.ts): the random names many keep, first names, nicknames; the
  free characters most often), each name free at the time (names are unique: a player who later wants a bot's
  name gets a variant, as with anyone).
- **How they play**: each has a **persona drawn from its id** (`persona`): time zone, words won on a day it
  plays (log-normal, median 9), the share of days it plays, win rate, misses, and the highest level it holds
  (its skill; otherwise a level every 10 words). It plays **hour by hour on a day's curve** (`DAY_CURVE`:
  evenings most, nights hardly; weekends a bit more), so bots in different time zones keep the board moving
  all day. Whether it plays on a day is drawn from its id and the day, so it holds all day.
- **One step does everything** (`advanceCrowd`): it plays every bot from its `synced_at` to now and writes the
  totals and the weeks (as a sync's `addRounds`). A new bot is inserted with `synced_at` weeks back (it
  "joined" 2–60 days ago, recent ones more often), so its first step builds its past; after a restart the
  next step catches up (90 days at most). Moving to a moment already reached adds nothing. Both steps take an
  advisory lock, because a redeploy briefly runs two servers.
- **Timer**: started by `buildApp` when the server is ready, every 5 min (`CROWD.tickMs`), stopped on close.
  `LEADERBOARD_BOTS` on Railway sets how many (default 100); fewer removes the extra ones, `0` takes them all
  off the boards. Tests leave it out: no bots.
- **Friends** (owner's call, 2026-10-26: "so it feels like the game is actually alive even more"): players
  find them in friends search and can send them a request, block or report them, as anyone. **A bot never
  answers**: the request waits in the player's Sent list, like one to a player who doesn't open the app (it
  counts toward `requestsMax`, and the player can cancel it). A bot that leaves the crowd takes its requests
  with it (cascade).
- **Kept out of the rest**: they can't sign in (their secret hash is no sha256), never write `word_days` (word
  statistics) and never play Versus (that has its own bots: [versus.md](versus.md), Bots).
- What it looks like with 100 (simulated on PGlite, a Monday evening): all time, #1 about 1,500 words, #50
  about 90; this week, #1 about 60 and #50 about 5 on the Monday, about 7 times that by Sunday. A new player
  who plays every day reaches the weekly top 50 within a day or two. All PLACEHOLDER in `CROWD`.

## Screen

- Header: `TitleHeader` ([GameHeader.tsx](../src/components/GameHeader.tsx)): avatar (opens Profile),
  the title, and `StillTokenPill`.
  - Tokens never move here, so the pill is the still one. A screen where tokens move (Play, Characters)
    has a live `TokenPill`; flights land on the focused one ([play-screen.md](play-screen.md), TokenPill).
- `PeriodSwitch`: This week (the default) / All time.
- **No podium** (owner's call, 2026-10-23). `RankRow` for everyone in the top 50: rank, face, name and
  score. The look follows the owner's reference (2026-10-24): the **top 3 are tinted, taller cards**
  (gold, blue, peach), each with a big **ribbon medal** (`medalXml` in icons.tsx, the rank drawn over it
  as text) in place of the number, a **crown** on #1 and sparkles in the medal's colour.
  - The medal and its sparkles are drawn **over** the row (a sibling after `Raised`, which clips), so the
    ribbons hang past the card's bottom and the crown rises above #1. The list starts `CROWN_RISE` lower
    so the scroll view doesn't clip the crown.
- The player's own row is the **star**: coral fill, white border, taller, a bigger face, sparkles, the
  outlined **YOU** badge, and its rank in a white chip (a pill for a long rank). In the top 3 it keeps the
  coral and wears the medal too. It shows the **local** name
  and character, which may be newer than the server's copy. If the player is ranked but outside the top
  50, their row is **pinned** at the end of the list, after a dotted break (`pinned`, keyed `me`).
- **Find me** (`FindMe`): a floating coral pill ("You · #12", with an arrow up or down) that shows while
  the player's own row is off screen and hides when it's in view. Tapping it scrolls the row to the
  middle, and the row pops. The screen knows which rows are on screen from `onViewableItemsChanged`.
  - **Rows have fixed heights** (`rowSpan`, pinned break included), so `getItemLayout` lets
    `scrollToIndex` reach any row, even one not rendered yet. Changing a row's height means changing
    `ROW` / `ME_ROW` / `TOP_ROW` / `PIN_GAP`, never letting content size it. The list has **no header** for the same
    reason (an empty board is the `ListEmptyComponent`).
- The screen can also show:
  - **Offline** (no connection, server down, or no `EXPO_PUBLIC_API_URL`): "You're offline", which also
    says their words still count, plus Try again.
  - **Empty** period: a nudge to guess a word.
  - **Not ranked** yet: "Guess a word to join the leaderboard."
- Pull to refresh. Each time the screen shows (or the period changes, or on refresh), it **syncs first**,
  then fetches. Each period keeps its last board, so a failed refresh still shows it.
- A name the server has as null shows the default name (`player.defaultName`): an old player, or a name
  the server's filter refused. Players set their name on Profile, and a new one gets a random name
  ([profile.md](profile.md)).

## Tabs

The bottom tabs are an Expo Router `Tabs` group, [src/app/(tabs)/_layout.tsx](../src/app/(tabs)/_layout.tsx):
- The navigator draws **no tab bar** (`tabBar={() => null}`). Each screen draws the mockup's
  [TabBar](../src/components/TabBar.tsx) itself, so a full-screen overlay (the level path) can still
  cover it.
- **The lens** (owner's request, 2026-10-24, modelled on the iOS 26 tab bar): the selected tab sits under a
  coral pill. A press lifts it into a bigger white glass bubble that follows the finger across the tabs;
  letting go drops it on the nearest tab and opens it. A plain tap opens the tapped tab.
  - Two gesture-handler gestures **compete** on the row: a pan (activates after 6 pt of movement) and a tap
    (no time limit, so a long still press counts too). **A pan alone can't do taps**: on a tap it never
    activates, it fails, and `onFinalize` reports a failure as `canceled`, the same as a real cancel. A
    single pan with `minDistance: 0` broke tapping on the iPhone (it worked in the web preview). The lens is a clipped window onto a second, coloured copy of the tabs, counter-translated,
  so a tab turns coral exactly where the lens covers it.
  - **The drag and the lens run on the UI thread** (Reanimated worklets); only opening the screen and the
    sound go back to JS (`scheduleOnRN`). The first version used `PanResponder` + `Animated`, and on the
    phone the drag lagged behind the Play scene, which keeps the JS thread busy redrawing.
  - Because each screen draws its own bar, the lens's shared values are **module-level (`makeMutable`),
    shared by every bar**: the screen that opens shows the same slide still going. A bar that gains focus
    some other way (a button, a link) slides the lens to its tab.
  - Screen readers: each tab is an accessible `tab` with an `activate` action (no `Pressable`: the row owns
    the touches).
  - No haptic tick while dragging across tabs: the owner finds frequent buzzing annoying (`src/feedback.ts`).
- A `TabBar` entry with an `href` navigates; an entry without one is drawn disabled ("Coming soon").
  All four navigate (Versus since 2026-10-23, [versus.md](versus.md)).
  **Never a 5th tab** (CLAUDE.md).
- Screens **stay mounted** when the player switches tabs, so Play keeps its round, its result and
  its animations' state. Each animation loop stops itself while its tab is hidden (`useIsFocused`).
  Since SDK 58 there is **no freeze**: `freezeOnBlur` has no effect in Expo Router, and its
  replacement `activityEnabled` is deliberately off, because it re-runs mount effects when a tab comes
  back (the streak takeover, token flight and level card would replay their sounds). A hidden tab
  still re-renders when the game state changes (a purchase, the language), which is cheap.
- On web, a hidden tab stays in the DOM. A test that finds a tab by its label must pick the
  visible one (`offsetParent !== null`). A DOM `.click()` on a tab does nothing (the row's pan gesture
  owns the touches): send a touch over CDP (`Input.dispatchTouchEvent` with touch emulation on), or
  `router.navigate`.
