# Server, database and sync

The app is **offline first** (owner's call, 2026-10-21). Everything the game needs lives on the
device: the words, rounds, tokens, levels and settings. The device is the source of truth. The
server only receives a **copy**, for two things:
- the **leaderboard**, the only screen that needs the internet ([leaderboard.md](leaderboard.md)),
- **word statistics**: which words are played, won and lost most.

The game never waits for the server. Offline, a sync fails quietly and the next one sends
everything again.

- Code: [server/](../server/), its own package (Node 24, Fastify 5, `pg`). Railway deploys that folder.
- API contract: [server/src/contract.ts](../server/src/contract.ts), the one place for the request and
  response types and the limits. The app imports it (`src/net/`, `src/game/progress.ts`), so it must stay
  plain types and constants with **no imports**.
- App side: [src/net/api.ts](../src/net/api.ts) (the only module that calls the server) and
  [src/net/sync.ts](../src/net/sync.ts) (the sync runner).
- Tests: [server/test/api.test.ts](../server/test/api.test.ts) runs the real SQL on **PGlite** (Postgres
  compiled to WebAssembly, in process), so nothing needs to be installed.

## API

| | |
|---|---|
| `POST /v1/players` | New anonymous player → `{ id, secret }`. Rate limit: 20 per hour per IP. |
| `POST /v1/sync` | `Authorization: Bearer <id>:<secret>`. Body: the player snapshot + up to 200 round reports. → `{ acked, wordsGuessed }` |
| `DELETE /v1/players/me` | Same auth. Deletes the player (App Store Guideline 5.1.1(v)) → `204`, or `401` if unknown. |
| `GET /v1/leaderboard?period=week\|all&me=<id>` | Top 50 + the asking player's rank. No auth: ranks are public. |
| `GET /health` | `SELECT 1`, for Railway. |

Every body and query is validated by a JSON schema in [app.ts](../server/src/app.ts) before a
handler runs. CORS (only the web preview needs it) allows GET, POST and DELETE: `@fastify/cors` allows only
GET, HEAD and POST by default, and the preview's delete failed until DELETE was added. Global rate limit: 120 requests a minute per IP (`trustProxy` is on, because Railway
sits behind a proxy).

## Accounts: anonymous for now

The first sync calls `POST /v1/players` and stores `{ id, secret }` in AsyncStorage under
`hanged.account.v1`, **apart from the game save**. The server keeps only a sha256 of the secret.
There's no login: deleting the app loses the account, the same as it loses the save. Sign in with
Apple is still an open question (CLAUDE.md). The player deletes their account from Profile
(`DELETE /v1/players/me`, then the app forgets the account and starts over:
[profile.md](profile.md)). The row goes, `player_weeks` with it (cascade); `word_days` stays, since it
has nothing that points back to a player. A `401` from
sync means the server doesn't know this player (e.g. its database was reset): the app drops the
account and registers again on the next sync, and that first sync re-seeds the score (below).

## Round reports and the sync

The reducer queues a **report** for every finished round, in the same step that wins or loses it:
`{ seq, wordId, level, won, wrong, description, letters, at }` in `state.reports`, saved with the game
([progression-and-tokens.md](progression-and-tokens.md)). `seq` counts 1, 2, 3… per device and is never
reused. `description` means the description was shown during play. Current clients always show it
from the start and report `true`; older clients required a free or paid reveal. Previously queued
reports keep their original values. The wire field and database column stay compatible.
`at` comes in on the `guess` action, so the reducer stays pure.

[GameContext](../src/state/GameContext.tsx) runs a sync:
- once the save is loaded. **Never before**: the first sync sets the player's starting score on the
  server, and a fresh state would set it to 0.
- when the app comes back to the foreground or goes to the background. iOS leaves a few seconds,
  enough for one request.
- 20 s after the last finished round (`SYNC_AFTER_ROUND_MS`), so a run of quick words sends one request.
- when the Leaderboard shows (`syncNow`), so the player's own row is up to date.

`createSync` runs one sync at a time: a second call joins the one in flight. It sends the snapshot
(`name`, `characterId`, `language`, `wordsGuessed`, `level`, `tokens`) with up to 200 reports, and loops
until the outbox is empty. After each batch it dispatches `reportsSent(acked)`. It filters by its own
`acked`, not by the state, because the state can lag behind its own dispatch.

The server, in **one transaction** that locks the player's row (`FOR UPDATE`):
1. Skips reports with `seq ≤ last_seq`. **A retry never counts twice.**
2. Sets the score with `nextScore`:
   - The **first sync** takes the device's `wordsGuessed` as it is, because the player may have played
     before syncing existed.
   - After that, the score grows by **at most the wins reported in that sync**. Editing the saved number
     doesn't move the leaderboard. Sending fake reports still would: real anti-cheat (plausibility
     checks, rate per hour) comes later.
3. Copies the rest of the snapshot, and adds to `rounds_played`/`rounds_won`. The name goes through
   `checkName` ([names.ts](../server/src/names.ts), shared with the app): one it refuses is stored as null.
   The schema lets names up to 64 through (`NAME_SENT_MAX`), so a too-long name never fails the whole sync.
4. Adds the wins to `player_weeks` (the Monday, UTC, of each report's `at`, capped at the server's now,
   so a fast device clock can't file wins in a future week).
5. Adds every report to `word_days`. Rows are written in key order so two syncs can't deadlock on the
   same words.

The outbox keeps at most `REPORTS_KEPT` (2000) reports and drops the oldest. A player that far behind
loses those rounds from the statistics, and also their wins from the score cap above. That needs
2000 rounds without a single sync.

## Database

Migrations: [server/src/migrations/](../server/src/migrations/), applied by `migrate()` at every start,
in name order, each once (`schema_migrations`). **Never edit an applied migration: add the next number.**

| Table | |
|---|---|
| `players` | id, secret hash, name, character, language, `words_guessed` (the score), level, tokens, rounds played/won, `last_seq`, `score_at` (when the score last rose: ties go to who got there first), `synced_at` (null = never synced) |
| `player_weeks` | `(player_id, week)` → words guessed that week |
| `words` | a copy of `data/words.json` (`npm run seed:words`), to show words in the statistics. **Not a foreign key**: a newer app may report a word the server hasn't seeded yet |
| `word_days` | `(word_id, day)` → played, won, wrong guesses, descriptions shown during play (always shown on current clients), letters bought |
| `word_stats` (view) | each word over all time: played, won, lost, `loss_rate`, `avg_wrong`, … |

**No table keeps individual rounds.** Reports are added into counters as they arrive, so storage
grows with players and words, not with rounds played. 100,000 players playing 20 rounds a day would
be about 2M rounds a day, roughly 5 GB a month if each round were stored.

To see the most lost words, run this in Railway's data tab:
`SELECT * FROM word_stats ORDER BY loss_rate DESC NULLS LAST, played DESC;`

## Running it

```bash
cd server
npm install
npm run dev          # no DATABASE_URL: embedded PGlite in server/.pglite (gitignored), seeded with the words
npm test             # node --test, on PGlite in memory
npm run typecheck
```

The app finds the server through **`EXPO_PUBLIC_API_URL`**. Without it, every call fails and the
Leaderboard says "You're offline", which is correct offline behaviour. For the web preview:
`EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --web`.
Expo Go on a phone can't reach `localhost`: use the computer's LAN address, or the Railway URL.

## Deploying on Railway

1. New project → **Deploy from GitHub repo** → this repo. In the service settings, set the
   **Root Directory** to `/server`. Railway runs `npm install` and `npm start` (`node src/index.ts`;
   Node 24 runs TypeScript directly, no build step). `engines.node` in `server/package.json` asks for 24.
2. Add a **PostgreSQL** database to the project. In the server service's variables, set
   `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
3. Settings → Networking → **Generate Domain**. Set the healthcheck path to `/health`.
4. Migrations run on every start. To fill the `words` table, run this from your machine with the
   Postgres service's **public** URL: `cd server && DATABASE_URL=… npm run seed:words`. Run it again
   whenever `data/words.json` changes.
5. Put the domain in the app: `EXPO_PUBLIC_API_URL=https://<domain>` (an `.env` file at the repo root
   works with Expo; `.env*.local` is gitignored).

Cost: one small service plus Postgres. Words are never served, a sync is one small request every
few rounds, and the leaderboard's top 50 is cached for 10 s and shared by everyone. A player's rank
is an indexed count, which is O(rank). Cache it if it ever shows up in the metrics.

## Traps

- **The root app's tooling ignores `server/`**: it's in `tsconfig.json`'s `exclude`, `eslint.config.js`'s
  `ignores`, jest's `modulePathIgnorePatterns`, and Metro's `blockList` for `server/node_modules` and
  `.pglite` ([metro.config.js](../metro.config.js)). `contract.ts` is still type-checked by the app
  because the app imports it.
- **PGlite vs `pg`**: [db.ts](../server/src/db.ts) hides the difference. Cast counts with `::int`,
  because `pg` returns bigints as strings. Multi-statement SQL goes through `exec`, because PGlite's
  `query` takes one statement.
- Keep the app's checks and the server's schemas in step with `LIMITS` in `contract.ts`.
- **`names.ts` is shared like `contract.ts`**: the app imports it, so its only import is the `obscenity`
  filter, which is in **both** `package.json` files (Metro can't see `server/node_modules`, so the app
  bundles its own copy; keep the two versions the same). The server re-checks names because the app's check
  can be skipped by a modified app.
