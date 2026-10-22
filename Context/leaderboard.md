# Leaderboard screen and tabs

Route: [src/app/(tabs)/leaderboard.tsx](../src/app/(tabs)/leaderboard.tsx). Parts:
[src/components/Leaderboard.tsx](../src/components/Leaderboard.tsx). Data:
[src/state/useLeaderboard.ts](../src/state/useLeaderboard.ts). Server side: [server.md](server.md).
It follows the mockup's Leaderboard screen. **The owner will rework the design**, so the
layout is the mockup's and nothing more.

## Ranking (owner's rules + engineering fixes)

- **The score is the number of words guessed** (CLAUDE.md). The owner first suggested also ranking by
  level and tokens. Tokens stay out, because spending them would drop a player's rank, and CLAUDE.md says
  spending never lowers the score. **Level breaks ties**, then **whoever got there first** (`score_at`).
- **All time**: `players.words_guessed`. **This week**: wins reported since Monday 00:00 UTC
  (`player_weeks`). Its ties go to whoever got there first.
- The **server** ranks; the device only sends its data. A player shows up once they have one word in the
  period.

## Screen

- Header: `TitleHeader` ([GameHeader.tsx](../src/components/GameHeader.tsx)): avatar (opens Profile),
  the title, and `StillTokenPill`.
  - Tokens never move here, so the pill is the still one. A screen where tokens move (Play, Characters)
    has a live `TokenPill`; flights land on the focused one ([play-screen.md](play-screen.md), TokenPill).
- `PeriodSwitch`: This week (the default) / All time.
- `Podium`: the top 3 under a sky. 2nd, 1st and 3rd stand on their blocks, and 1st cheers. A missing place
  stays empty.
- `RankRow`: rank, face, name and score for the rest of the top 50.
- The player's own entry has the **YOU** badge and a coral border. It shows the **local** name and
  character, which may be newer than the server's copy. If the player is ranked but outside the top 50,
  their row is **pinned** under the list.
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
- A `TabBar` entry with an `href` navigates; an entry without one is drawn disabled ("Coming soon").
  Play, Leaderboard and Characters navigate; Versus is still disabled.
  **Never a 5th tab** (CLAUDE.md).
- Screens **stay mounted** when the player switches tabs, and they're **frozen while hidden**
  (`freezeOnBlur`). So Play keeps its round, its result and its animations' state, and stops
  re-rendering behind the Leaderboard.
- On web, a hidden tab stays in the DOM. A test that clicks a tab by its label must pick the
  visible one (`offsetParent !== null`).
