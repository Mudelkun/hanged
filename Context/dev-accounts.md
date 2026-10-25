# Developer accounts: roles and permissions

The owner's request (2026-10-25): an account for development and testing that owns every character
(new ones included), plays any level, spends tokens freely and has developer tools, with the name
**"Admin"** reserved for it. Its privileges must be granted securely on the server, must never reach
regular players, must not touch the leaderboards, rankings or multiplayer fairness, and must not be
a second copy of the game's logic.

## How it works

- **Roles live on the server**: `players.role` (migration 006), null for every regular player.
  What each role allows is [server/src/roles.ts](../server/src/roles.ts), shared with the app like
  `contract.ts` (no imports). Today there is one role, `admin`, with every permission.
- **The admin page is the only thing that sets a role** (`/admin`, behind `ADMIN_TOKEN`: "Developer
  accounts"). Find the player by name or id, then "Make admin" or "Take role away". The code is in
  [staff.ts](../server/src/staff.ts) and the routes are in [admin.ts](../server/src/admin.ts). Never a
  name, never anything a device sends. Grant it **from the page**, not with SQL: the grant also drops
  the player's weekly rows (below) and tells a connected Versus socket.
- **The device learns its role from the sync response** (`SyncResponse.role`) and saves it in the game
  save (`GameState.role`, set only by the reducer's `role` action). It shows up on the next sync: open the
  app or its Leaderboard. A new account (deleted, or re-registered after a `401`) starts with none.

### Getting the owner's account to "Admin"

1. On the phone, play once so it syncs (any name, e.g. "Roda").
2. On `/admin`, find "Roda", then "Make admin".
3. Open the app (or the Leaderboard tab) so it syncs. The Developer group appears on Profile.
4. On Profile, rename to "Admin" (any capitalization).

## Permissions (`PERMISSIONS` in roles.ts)

| Permission | What it bypasses | Where it's checked |
|---|---|---|
| `allCharacters` | Every character in the shop is owned, including future ones. **Nothing is written to `unlockedCharacterIds`.** | `ownsCharacter` |
| `unlimitedTokens` | Spending is free: affordable always, **the balance never goes down** (earning still adds) | `canAfford`, `afterPaying` (letters, characters) |
| `anyLevel` | `jumpToLevel`: Profile → Developer → Level (sheet of all levels), and "Deal a new word" | the reducer's `jumpToLevel` |
| `devTools` | The Developer group on Profile ([DevTools.tsx](../src/components/DevTools.tsx)): win or lose the current word | `finishingGuesses` |
| `reservedNames` | May take a name in `RESERVED_NAMES` ("Admin"), on the device and on the server | `checkName(name, rules)` |
| `unranked` | Kept off both leaderboards, the word statistics and Versus ratings (server side) | sync, `leaderboard.ts`, `hub.ts` |

**One rule, one place.** Each power is a check inside the existing rule (`can(state, permission)` in
[progress.ts](../src/game/progress.ts)), never a second path through the game:
- `jumpToLevel` moves the level with `onLevel` (the same fresh start as a level change), keeps
  `bestLevel ≥ level`, and deals the word through `newRound`. The round in progress is dropped: no
  report, no loss, no streak or daily change.
- "Win/Lose this word" sends **ordinary `guess` actions** (`finishingGuesses`: the hidden letters, or
  wrong letters still on the keyboard). So the round scores, pays, reports and moves the level exactly
  like a played one. The tools return to Play, where the result shows.
- **A role taken away leaves nothing behind** (the `role` action): the characters it owned go (the
  picked one falls back to `DEFAULT_CHARACTER` if it wasn't bought), a reserved name goes (the
  provider gives a random one), and the balance and bought characters stay exactly as they were. That's
  why the powers never write to the save.
- A role the app doesn't know (an older app, a typo in a save) is no role (`isRole`).

## Keeping it away from other players

- **Unranked rounds never count** ([players.ts](../server/src/players.ts) `sync`): its reports are acked
  (so the device drops them) but add nothing to the score, totals, `player_weeks` or `word_days`. Rounds
  played with powers nobody has would skew the boards and the word statistics.
- **Boards** ([leaderboard.ts](../server/src/leaderboard.ts)): the all-time board and every rank filter
  out `UNRANKED_ROLES` (a filter on the rows the index already finds; staff rows are few). The weekly
  board needs no filter on the count, because granting the role deletes the player's `player_weeks`
  rows and the sync never writes new ones. The account's own `me` is null; its Leaderboard says
  "Developer accounts aren't ranked".
- **Taking the role away** puts the player back on the all-time board with only what they earned
  without it: the score never took the role's wins (`nextScore` then grows only with new wins).
- **Versus** ([hub.ts](../server/src/versus/hub.ts)): a developer is matched like anyone, so matchmaking
  can be tested, but **a matchmade match with an unranked player is unrated for everyone in it** (no
  rating moves). The server is the referee there, so the device's powers can't reach a match.
- **The name**: "Admin" is in the filter's `EXTRA_WORDS`, so it's blocked for everyone; `checkName(name,
  { reserved: true })` lets the exact reserved names through (`nameKey`: "ADMIN", "a.d.m.i.n"), and
  never what contains them ("AdminRoda"). Names are unique, so one account holds it. The server checks
  with the role **it** holds (sync, and `GET /v1/names/available` **signed in**: the app sends its
  `Authorization`. A bare `me=<id>` never unlocks it, because ids are public on the boards and the answer
  would tell anyone which accounts are staff); the app checks with its saved role so Profile's field accepts it.

## What a modified app can and can't do

A modified app can pretend to hold a role, **on its own device only**: it's the same as editing the
save, which was always possible (offline first: [progression-and-tokens.md](progression-and-tokens.md)).
It can't get a role on the server, can't take "Admin" (the server stores null), and doesn't get the
unranked treatment (its rounds count like any edited save's, capped by `nextScore`). Nothing on the
server trusts the device's word for a role.

## Adding to it

- **A new power**: add it to `PERMISSIONS` (and to a role), then check `can(state, '…')` inside the
  rule it bypasses. If it changes what happens in a solo round, add it to `PLAY_POWERS`: a test makes
  every role with a play power `unranked`.
- **A new role** (e.g. a tester without the reserved name): one line in `ROLE_PERMISSIONS`. No migration;
  the admin page's button offers the first role in the list (`roles[0]`), so give it a choice then.
- **A new developer tool**: a row in `DevToolsGroup` that sends the game's own actions, with its text in
  all four `src/i18n/*.json` files.

Tests: [server/test/staff.test.ts](../server/test/staff.test.ts) (the page, the name, the boards, the
sync), `versus-api.test.ts` ("developer accounts"), and
[src/game/__tests__/dev-accounts.test.ts](../src/game/__tests__/dev-accounts.test.ts) (the reducer).
