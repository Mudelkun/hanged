# Versus: online multiplayer

The Versus tab: three online modes against friends or random players, a friends system, lobbies,
invites, matchmaking, and an admin switch that turns it all off. Built 2026-10-23 at the owner's
request ("design and implement a complete multiplayer experience… keep infrastructure costs as low as
realistically possible… a switch to turn multiplayer off at any moment and a screen for it").

The solo game never depends on any of it (offline first, CLAUDE.md). Versus is the one part that
needs the internet.

## Decisions (and why)

| Decision | Why |
|---|---|
| **WebSockets on the existing Railway server** (`@fastify/websocket`), no third-party realtime service | Cheapest: no per-message or per-connection fees (Pusher, Ably, Firebase bill per message/connection). One small Node instance holds tens of thousands of idle sockets; a guess is ~100 bytes judged in microseconds. |
| **The server is the referee** (authoritative): it deals the words, judges every guess, keeps the clocks, decides the result | Fairness. A device only sends letters and **never holds a word it has to guess**, so a modified app can't read the answer, fake a score or stop a clock. |
| **Matches live in memory**; only their outcome is written (one transaction) | A match lasts minutes. Writing every guess would cost database load for nothing. Like the solo rounds: storage grows with players, not with matches. |
| **Same engine as solo** (`server/src/engine.ts`, shared like `contract.ts`) | One set of rules: clue letters, accents, judging. The engine moved from `src/game/` (which re-exports it) because Railway deploys only `server/`. |
| **Ranked = matchmade only**; friend matches never move ratings | Friends can't trade wins to climb. |
| **Bots fill a quick match nobody else fits** (after 9-15 s), on the server, in every mode | The owner's request (2026-10-26): Versus must feel alive at any hour, never broken. See Bots below. |
| **A match with bots is ranked**, and bots look like any player to the app | They play at the player's rating, so it's a fair game; flagging them would make the match feel like practice. The in-app Game rules say computer players fill in when nobody's free. |
| **A matchmade match with a developer account is unrated** for everyone in it | A developer can test matchmaking without moving anyone's rating ([dev-accounts.md](dev-accounts.md)). |
| **Versus doesn't count toward the leaderboard or pay tokens** | Still an open question for the owner (CLAUDE.md). It has its own rating instead. Changing it is a server-side decision (the reducer must still be the only place that adds score/tokens). |
| **REST for friends, socket for live things** | Friends change rarely and want a plain answer; the socket pushes `friends` so open lists refresh without polling. |
| **Socket open only while useful** | Cost: see "When the app is connected". |

## The modes (`MODES` in [versus-contract.ts](../server/src/versus-contract.ts), PLACEHOLDER numbers)

- **Word Rush** (`rush`, the owner's timed challenge, 2-4 players, 2:00). Everyone gets the **same
  words in the same order** (and the same clue letters: the match deals each round once and shares it).
  Each word allows 6 misses; a lost or skipped word moves on without a point. **Most words wins**; ties:
  fewer misses, then whoever reached their score first.
- **Balloon Battle** (`battle`, 2-4 players, 4:00 cap). Everyone floats under 10 balloons for the whole
  match and plays the same words. A miss pops one of yours. A word guessed pops one balloon of **the
  opponent with the most** (two if guessed without a miss), so the leader is everyone's target and matches
  stay close. A skip costs a balloon. No balloons: you land (out). **Last one floating wins**; at the cap,
  most balloons, then most words, then fewer misses. Landed players rank by who landed last.
- **Word Duel** (`duel`, 1 against 1, best of 3). Each round both pick a word for the other: one of 3
  dealt cards, or **any word typed**, as long as it's in the language's word pack (4-15 letters, not used
  this match). Then both guess at once (8 misses, 90 s). Solving beats not solving; then fewer misses;
  then faster (unsolved: more letters found). Two round wins ends it. This is the owner's original
  two-player idea (CLAUDE.md), made fair: both sides pick, and typed words must be dictionary words
  (no nonsense strings, nothing offensive outside the pack).

Versus words are everyday words (rarity ≤ 20, difficulty ≤ 8, 5-10 letters: the familiarity of solo
levels 1-15) from the `words` table, loaded once into memory by [versus/words.ts](../server/src/versus/words.ts).
A match is played in the language of whoever started it (matchmaking queues are per mode **and**
language). The server fills the `words` table itself at start from its own copy of the packs
([server.md](server.md), Deploying, step 4). With an empty pool, starting a match answers `noWords`
("Versus isn't ready in this language yet"); the admin page shows each language's pool size, red at 0.

## Server ([server/src/versus/](../server/src/versus/))

| File | |
|---|---|
| [versus-contract.ts](../server/src/versus-contract.ts) | Modes, limits, every message and view type. Shared with the app, no imports. `VERSUS_PROTOCOL` bumps on breaking changes (old apps get `bye: 'version'` → "Time for an update"). |
| [hub.ts](../server/src/versus/hub.ts) | One per process: sockets (auth, rate limit, heartbeat, one socket per player), presence, invites, routing to lobbies/matchmaker/matches, results, the switch, draining. |
| [match.ts](../server/src/versus/match.ts) | `Match` (phases, deadlines, dedupe, away/forfeit, standings) and `RushMatch`, `BattleMatch` (both `RaceMatch`) and `DuelMatch`. Pure apart from an injected clock, so tests drive time. |
| [lobbies.ts](../server/src/versus/lobbies.ts), [matchmaker.ts](../server/src/versus/matchmaker.ts) | Pure data: the hub sends the messages. |
| [bots.ts](../server/src/versus/bots.ts) | Bots: who they are (name, character, rating, style) and how they play a seat (below, Bots). |
| [puzzle.ts](../server/src/versus/puzzle.ts) | A round → what its player may see (`PuzzleView`: shown letters only) and what others may see (found/to find counts). |
| [rating.ts](../server/src/versus/rating.ts) | Elo (K 32, PLACEHOLDER), pairwise for 3-4 players with K shared. |
| [store.ts](../server/src/versus/store.ts) | Friends, requests, blocks, reports, results, the switch. |
| [routes.ts](../server/src/versus/routes.ts), [admin.ts](../server/src/admin.ts) | HTTP. |
| [links.ts](../server/src/versus/links.ts) | Friend invite links on the web: the `/i/<code>` page and the `.well-known` files (below, Invite links). |

### The socket (`GET /v1/live`)

1. The app sends `auth` (id, secret, protocol) within 5 s. Never in the URL (URLs get logged).
2. `hello` answers with the switch, stats, and `inMatch`/`inLobby`; the match snapshot, lobby, invites and
   any unseen result follow at once. **A reconnect resumes in one round trip.**
3. Every client message is rate limited (burst 20, then 10/s; way over: `bye: 'abuse'`), shape-checked,
   and at most 2 KB (`maxPayload`). Compression is off: messages are tiny and per-socket deflate costs
   memory.
4. The server pings every 30 s; no pong by the next ping closes the socket.
5. **One socket per player**: a new one replaces the old (`bye: 'elsewhere'`).
6. A socket that closes **while it signs in** (between the database reads) is never registered: `signIn`
   checks it's still open after its last read. Otherwise it would stay "online" forever, with no close left to come.
7. **A deleted account** (`DELETE /v1/players/me`) loses its socket at once (`hub.forget`, `bye: 'auth'`); its
   match, lobby and queue let go of it as on any close.

Match traffic is **deltas**: a full `match` snapshot only on start, phase change and reconnect; then
`puzzle` (your word, to you only), `player` (one player's counts, to everyone), `hit`, `end`.

### Fairness and abuse

- Words are never sent before they're guessed; the result list shows the match's words at the end.
- Every match message carries the client's counter `n`; the server judges each `n` once (a retry after
  a reconnect can't double a guess). The app uses `max(last + 1, Date.now())`, so it stays increasing
  across app restarts.
- Every phase has a **server deadline**: a match never waits on a device (Duel picks a card for whoever
  runs out of time).
- Leaving is a forfeit (placed last; ranked: counted as a loss), so rage-quitting doesn't save a rating.
- Blocks work both ways: no requests, invites, lobby joins, search results or matchmaking between the
  two. A block is never revealed (a request to a blocker answers "sent").
- Reports (`name`, `cheating`, `other`) go to `player_reports`; the admin page lists the most reported.
  App Store Guideline 1.2 asks for this. **Acting on reports (removing a name, banning) is still manual**
  (SQL on Railway).
- Friend search needs 2+ letters, returns 20, and is rate limited; friend lists cap at 200 and pending
  requests at 50 per player.
- Not prevented: a bot that reads the clue and searches the dictionary. No client can stop that; the
  rating and per-account history would show it. Detection is future work.

### Disconnections

| Situation | What happens |
|---|---|
| Socket drops mid-match | The player is `away` (others see it); the clock keeps running. Back within **45 s** (`awayForfeitMs`): full snapshot, play on. Later: forfeit. |
| Player leaves on purpose | Forfeit at once; they're free immediately; the match ends when one player is left. |
| Socket drops in a lobby | 20 s grace (`lobbyGraceMs`) before they leave it. |
| Socket drops in the queue | Out of the queue (server side); the app **re-queues by itself** after reconnecting (`live.remember`). |
| Result arrives while away | Kept 10 min; shown on reconnect. |
| Server redeploy | `SIGTERM` → `drain(VERSUS_DRAIN_SECONDS)`: nothing new starts, running matches may finish, then the rest are cancelled (count for nothing) and sockets get `bye: 'restart'`; apps reconnect to the new server with backoff and jitter. |
| Server restarted mid-match (crash) | The match is gone; the next `hello` says `inMatch: false` and the app shows "The match ended while you were away". |

### Database ([migrations/004_versus.sql](../server/src/migrations/004_versus.sql))

`friends` (two rows per friendship, so a player's list is one index range), `friend_requests`,
`blocks`, `player_reports`, `players.versus_rating/played/won`, `versus_days` (matches per day and
mode, for the admin page; **never a row per match**), `settings` (the switch), `words` gains
`description`, `subject`, `rarity`, `difficulty`, and `players_name_prefix` serves the search. Deleting
an account cascades through all of it.

### REST

`GET /v1/versus/status` (public), and with the player's Bearer credentials (503 while Versus is off):
`GET /v1/friends`, `GET /v1/players/search?q=`, `POST /v1/friends/requests {playerId}`,
`POST /v1/friends/requests/:id/accept`, `DELETE /v1/friends/requests/:id`, `DELETE /v1/friends/:id`,
`PUT|DELETE /v1/blocks/:id`, `POST /v1/players/:id/report {reason}`, `POST /v1/invites` (my code),
`POST /v1/invites/:code/accept`. Public: `GET /v1/invites/:code` (whose link it is), `GET /i/:code` (the page).

## Bots (owner's request, 2026-10-26)

"Make multiplayer feel active and enjoyable, even when there aren't enough real players online… bots must
follow the same game rules as real players and never have unfair advantages."

- **When**: only in quick match (friend lobbies are for friends). Each wait draws its own bot time,
  `BOT_WAIT_MS` 9-15 s (PLACEHOLDER, [matchmaker.ts](../server/src/versus/matchmaker.ts)), so it's never the
  same beat. **Real players always come first**: a tick pairs players before it gives anyone bots, and the bot
  time is longer than `FILL_WAIT_MS`, so two players who fit always get a real table. Then the hub seats one
  bot for a duel, one to three for Rush and Battle (`tableWeights`), and the match starts like any other.
- **Same rules, no advantage**: a bot is a `Seat` (`bot: true`) of an ordinary `Match` and plays through the
  calls a device makes (`guess`, `skip`, `pick`, its own `n`), so the referee, the clocks, the dealing and the
  dedupe are the same. The match's messages to it go to `Bot.receive` instead of a socket (`matchHost.send` in
  the hub), so it sees **exactly a device's view** (`PuzzleView`: shown letters only) and never the word.
- **How it plays**: like someone who knows everyday words. It tries likely letters by the language's letter
  frequencies (each bot with its own taste for vowels; stronger bots stick to the commonest), and the more of
  the word shows, the likelier it **recognises** it: then it plays the letter most of the fitting words share
  (the dealing pool matched against the tiles, indexed by length once per pool). That's the description and
  the player's vocabulary, as a probability. It slips now and then (an odd letter), gives up a lost-looking
  Rush word (skip), rarely skips in Battle, and in a duel gives one of its cards (a hard one, if it's cunning).
  A word typed by the player (not in the pool) is guessed on frequencies alone, as a person would.
- **Skill and level**: a bot's rating is the player's, give or take 40; its skill (0-1) comes from that rating
  (`skillPerPoint`), with a spread so two bots of one rating differ, and gentler bots for a player's first 5
  matches. All PLACEHOLDER in `BOT_TUNING`. Ratings move against bots as against anyone, so the system settles
  where the player wins about half their bot matches: harder as they climb, easier after a slump.
  Simulated on the real English pool (bots against bots, 2:00 Rush): skill 0.2 guesses about 3 words, 0.5
  about 7, 0.9 about 12; a 0.1 skill gap wins Rush about 3 times in 4, Battle and Duel about 3 in 5.
- **Human pace**: every action waits a drawn think time: an ordinary guess (2.6 s for the weakest, 1.1 s for
  the strongest, ±35%), reading each new word first, typing faster once it knows the word, a long pause now
  and then (5%), never under 380 ms. Duel cards take 3-7 s.
- **Who they look like**: names as players have them (the random name many keep, sometimes its "2" variant,
  a first name in some form, a nickname; all pass `checkName`, never the player's own), the same random-name
  lists as onboarding (moved to the shared [names.ts](../server/src/names.ts)); characters from the whole
  rig, the free three most often (`BOT_CHARACTERS`: a test checks it against `design/characters/rig.js`).
  The app gets nothing that says "bot": bot ids are random UUIDs with no row in `players`, so friends,
  search and reports never meet one.
- **Leaving**: a player who leaves (or is away too long) with only bots left ends the match at once
  (`forfeit`: placed last, ranked loss, as against people). Bots never leave.
- **Counting**: `saveResult` writes only the real players (bots have no rows); `versus_days.bot_matches`
  (migration 008) counts the day's matches with bots, shown on the admin page with "Bots playing" now.
- **Off**: `VERSUS_BOTS=0` on Railway (the hub's `bots: false`): queues wait for players only.
- **Cost**: a bot is a few timers and a shrinking list of fitting words; no database, no socket.

## Invite links (owner's request, 2026-10-24)

"Allow players to invite people who haven't downloaded the app yet… as simple and seamless as
possible." A player shares a link (Friends screen, "Share my invite link"); whoever follows it becomes
their friend, **with no request to answer**: sharing the link was the invitation.

- **The link**: `https://<server>/i/<code>`, on the server's own domain (no link service: Firebase Dynamic
  Links is gone, Branch/AppsFlyer cost money and add a tracking SDK). **One code per player**, 8 letters of
  the lobby alphabet (40 bits, unguessable), made on the first share (`players.invite_code`, migration 005)
  and then kept, so every link ever shared keeps working. Not revocable yet; a "new link" button would just
  overwrite the column.
- **App installed**: the phone opens the app from the link (iOS Universal Links, Android App Links; the
  domain comes from `EXPO_PUBLIC_API_URL` in [app.config.ts](../app.config.ts), and the server serves
  `/.well-known/apple-app-site-association` and `assetlinks.json`). `hanged://i/<code>` works too.
  [src/app/+native-intent.tsx](../src/app/+native-intent.tsx) takes the code and keeps the app where it is
  (an invite isn't a screen).
- **App not installed**: the link opens the server's page (the inviter's name, "Get Hanged"), which sends
  the player to their store. Getting the code across the install:
  - **Android: automatic.** The page redirects at once to Google Play with `referrer=invite=<code>`; the app
    reads the install referrer on its first launch (`expo-application`). Nothing to tap.
  - **iOS: one tap.** Apple passes nothing through the App Store and forbids fingerprinting (matching an IP
    or device to the page visit), so the page's "Get Hanged" copies the link before opening the App Store,
    and onboarding's first screen offers the system **Paste** button (`expo-clipboard`'s
    `ClipboardPasteButton`: no "Allow paste" prompt; it shows only when the clipboard holds a URL, which
    `hasUrlAsync` tells without reading it). Missed it? Tapping the link again opens the app.
- **The code waits on the device** ([src/invite/pending.ts](../src/invite/pending.ts), `hanged.invite.v1`)
  until the server answers for good, so an invite that comes offline, during onboarding or before the player
  has an account still goes through. [useInviteLink](../src/state/useInviteLink.ts) sends it once
  onboarding is done, and again on every return to the foreground while it fails (offline, or Versus off: 503).
- **New player** (the invite came before onboarding finished; `acceptsByItself`: consent's `acceptedAt` is
  later than the invite): friends at once after onboarding. **Existing player**: a sheet asks first
  ("{name} invited you": Be friends / Not now), as the owner asked.
- **The result** shows as a banner over any screen but a match (`friendNote` in the Versus state): "You and
  Roda are friends now!" on both sides (the inviter's comes as the socket message `friendAdded`), or why the
  link didn't work (their own link, gone, a friends list full). A block either way answers `sent` and does
  nothing, as a friend request would, so it isn't revealed.
- The page and the lookup work while Versus is off; accepting doesn't (friends are Versus), so the invite
  waits. The page is English only, like the MVP, and escapes the name (the server filters names too).
- **Expo Go can't test the store part**: it can't claim a domain, and its install referrer is its own.
  `exp://<lan>:8081/--/i/<code>` opens an invite in Expo Go; the full flow needs a build.

Server settings (Railway variables, all optional; without them the page says "coming soon" and phones open
the page instead of the app): `APPLE_APP_ID` (`<team id>.<bundle id>`), `APP_STORE_ID` (the number in the
App Store URL), `ANDROID_PACKAGE`, `ANDROID_CERT_SHA256` (comma separated, from Play Console's App signing),
`PUBLIC_URL` (`https://<domain>`: the page's link, the one iOS copies, is built from it; without it the
request's Host is used, which a caller can forge, so the page is only ever cached `private`).
The iOS bundle id is `com.mudelkun.hanged` (its App ID has the Associated Domains capability); `android.package`
isn't chosen yet.

## The switch (kill switch) and the admin page

- **`/admin`** on the server (set `ADMIN_TOKEN`, 24+ characters, on Railway; without it the page doesn't
  exist). It asks for the token, then shows the switch, an optional message for players, "also stop
  running matches now", live counts (online, in matches, bots playing, queued, lobbies) and the last 7 days (with the matches bots filled).
  The token is compared in constant time; tries are rate limited (30/min).
- **Off**: queues, lobbies and invites close at once; sockets not in a match close (`bye: 'disabled'`);
  running matches finish, or stop at once (counting nothing) with the checkbox. Friends routes answer 503.
  The app's Versus tab shows **"Versus is taking a break"** with the admin's message and "Check again".
- Stored in `settings` (survives restarts). **`VERSUS_DISABLED=1`** forces it off whatever the switch says
  (if the database itself is the problem).

## The app

| File | |
|---|---|
| [src/net/live.ts](../src/net/live.ts) | The socket: open while wanted, auth, reconnect with growing jittered delay, stop on a final `bye`, `remember` (the queue). |
| [src/state/versus.ts](../src/state/versus.ts) | Pure reducer: server messages → state (tested). |
| [src/state/VersusContext.tsx](../src/state/VersusContext.tsx) | Provider: when to connect, actions, `useFriends`, `useLiveWhileFocused`. |
| [src/app/(tabs)/versus.tsx](../src/app/(tabs)/versus.tsx) | The tab: stats, a card per mode (Quick match / With friends / ?), join with a code, Friends. |
| [src/app/match.tsx](../src/app/match.tsx) | The live room: result > match > lobby > queue, whichever exists. Opens by itself (`VersusRouter` in `_layout.tsx`) when the server puts the player in one; closes when empty. No swipe back. |
| [src/app/friends.tsx](../src/app/friends.tsx) | Share my invite link, search, requests, friends with presence, invite, remove/block/report, blocked list. |
| [src/invite/](../src/invite/), [src/state/useInviteLink.ts](../src/state/useInviteLink.ts), [InviteLink.tsx](../src/components/versus/InviteLink.tsx) | Invite links: codes out of links and referrers, the waiting invite, accepting and sharing, the sheet, banner and onboarding card. |
| [src/components/versus/](../src/components/versus/) | Hub, Room (queue, lobby, invite sheet), MatchPlay, MatchResult, Friends (row, invite banner), parts. |

- **Buttons send; screens change when the server answers.** The room opens on the server's `queued`,
  `lobby` or `match`, not on the tap.
- The match screen reuses the solo pieces (scene, tiles, description, keyboard). A pressed key is
  **pending** (faded, `LetterKeyboard`'s `pending`) until the server judges it, typically one round trip.
- Music: a match plays its mode's seamless loop instead of the solo playlist (`useMatchMusic` in `match.tsx`; [audio-design.md](audio-design.md)).
- Timers show the server's deadlines with the clock offset from `hello`/`match` (`serverNow`).
- An invite shows as a banner over any screen except a match.
- Versus needs an account: the first use syncs to make one (`versusAccount`), so the server has the name
  and character before anyone sees them.

### When the app is connected (cost)

Open while a Versus screen shows, while in a queue/lobby/match, and, once the player has opened Versus
once (`hanged.versus.v1`), while the app is in the foreground, so invites arrive on any screen. Closed in
the background (iOS would freeze it anyway). Players who never open Versus never open a socket.

## Costs and scaling

- Database: read at sign-in (player, friends, blocks), written per friendship change and **once per
  match**. Nothing per guess or per tick; the matchmaking timer runs only while someone waits.
- One instance is the whole design today: presence, lobbies, invites and matches are in its memory. At
  roughly 10k concurrent players a 1-2 GB instance is comfortable; the first limits will be the Node event
  loop and memory, visible in Railway's metrics.
- **The way out when one instance isn't enough** (not built): route each match to one instance and fan
  presence/invites out with Postgres `LISTEN/NOTIFY` (no Redis needed), or run Versus as its own service.
  Keep `hub.ts` the only owner of live state so that change stays in one file.
- Railway's zero-downtime deploy runs old and new instances side by side for a moment: players on the old
  one finish there (`VERSUS_DRAIN_SECONDS`, keep it under `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`).

## Running and testing

```bash
cd server && npm test     # versus-match.test.ts (modes, fake clock), versus-bots.test.ts (bots, matchmaking with bots), versus-api.test.ts (real sockets, REST, switch, invite links, a match with bots)
npm test                  # app: src/state/__tests__/versus.test.ts (reducer), src/invite/__tests__/link.test.ts
cd server && ADMIN_TOKEN=<24+ chars> npm run dev   # then http://localhost:3000/admin
```

Two players locally: two browser profiles on the web preview (each has its own AsyncStorage, so its own
account), `EXPO_PUBLIC_API_URL=http://localhost:3000`.

## Traps

- **Shared files import with `.ts` extensions** (`./languages.ts`): Node needs them, and the app's
  `tsconfig.json` has `allowImportingTsExtensions` for it. Shared files may import only other shared files.
- `erasableSyntaxOnly` (Node runs the server's TypeScript directly): no constructor parameter properties,
  no enums.
- Names are unique, so two test runs that make "Bo" make "Bo" and "Bo2".
- The React Compiler lint rules: no refs read while building the socket (the account function is stable,
  so it's passed directly); no setState straight in an effect (the friends refresh is a short debounce).
- The lobby's invite sheet closes itself once the lobby is full (Start is under it).
- **The app's Versus reducer ignores messages it doesn't know** (`default`). Before 2026-10-24 an unknown
  message returned `undefined` and wiped the state. A new message type no longer needs `VERSUS_PROTOCOL`
  bumped, as long as older apps can do without it.
- A component test that renders onboarding's first screen must mock `OnboardingInvite` (it reads
  AsyncStorage), as `src/components/__tests__/localization.test.tsx` does.
