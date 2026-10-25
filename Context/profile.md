# The Profile page: name, info pages, deleting the account

Route: [src/app/profile.tsx](../src/app/profile.tsx), pushed on the root Stack (not a tab: CLAUDE.md, never a
5th tab). Parts: [src/components/Profile.tsx](../src/components/Profile.tsx). Info pages:
[src/app/info/[page].tsx](../src/app/info/[page].tsx) + [src/components/InfoPages.tsx](../src/components/InfoPages.tsx).
Name rules: [server/src/names.ts](../server/src/names.ts) (shared), [src/game/names.ts](../src/game/names.ts) (random names).

## Owner's calls (2026-10-22)

- **No profile picture for now.** No uploads means no user photos to moderate and no camera/library permission
  or privacy work. The avatar is the character's face everywhere; the mockup's "Change photo" is
  **"Change character"** (opens the Characters tab), and the camera badge on the face is a little cat.
- **The name is the only thing the player edits here.** It's filtered. Onboarding offers a random name
  and the same `PlayerNameInput` and validation messages; see [onboarding.md](onboarding.md).
- Sound is now integrated (owner, 2026-10-22). Settings has separate **Sound effects & voices** and **Music** switches, saved on the device and defaulting on. Language remains English and not pressable. See [audio-design.md](audio-design.md). A **Daily reminder** switch sits between them and the language (native only; [retention.md](retention.md)). The switches are our own `Toggle` (in `Profile.tsx`), not React Native's `Switch`: on iOS 26 the native switch is wider than the frame React Native gives it and draws off-centre in the row.
- **Privacy policy and terms of use** share onboarding's explicit draft placeholder (`LegalDocument`).
  **Contact & support** still says "Coming soon". The actual legal texts and privacy policy URL remain to be supplied before release.

## The page (mockup: Profile)

`BackHeader` (back, title, still token pill) · name card · stat tiles · daily streak card · SETTINGS · (DEVELOPER, only for a
developer account: [dev-accounts.md](dev-accounts.md)) · INFO & LEGAL · footer.
It scrolls; since the daily streak card and the reminder switch (2026-10-24), a 375×667 phone has to scroll to the info list. **No tab bar**: it's a pushed page over the
tabs (the mockup draws one; a pushed page covering it is the iOS way and leaves more room).

- **Avatar**: `Avatar` from GameHeader at 78. Tapping the face, or the "Change character" pill, does
  `router.dismissTo('/characters')`: back down the stack and onto the Characters tab.
- **Name**: tap it (or its pencil) to edit in place. A text field (the system keyboard is fine here: the
  rule against it is only for guessing), a dice that fills in a random name, Cancel and Save. Under the field:
  the limits, or the problem in coral as the player types. The field stops at 15 characters. "Too short" waits for Save, because every name
  starts too short. A saved name pops, and "Nice to meet you, Roda!" shows for 2.4 s.
- **Stats**: words guessed (mint), tokens (butter, coin), level in **its own level colour** (like the header
  pill; the mockup's sky is level 2's colour).
- **Info & legal**: Game rules, Privacy policy, Terms of use, Contact & support, **Credits** (not in the
  mockup; the WordNet licence needs it). Each pushes `/info/<page>`.
- **Footer**: "Hanged: word guessing game · v1.0.0" (the version is `app.json`'s `expo.version`) and
  "Delete account".

## Player names

The rules live in [server/src/names.ts](../server/src/names.ts) and are **shared**, like `contract.ts`. Its
only import is the [`obscenity`](https://github.com/jo3-l/obscenity) filter (MIT, no dependencies), which is
in both `package.json` files: keep the two versions the same. The app checks a name before saving it (the reducer's `rename`), and the server checks it
again on every sync, because a modified app could skip the first check.
null, and boards show the default name.

- `cleanName`: drops control and invisible characters, single spaces, trims.
- `checkName` → `{ ok, name }` or a problem:
  - `short` / `long`: **2 to 15** characters (`NAME_MIN`, `NAME_MAX`), counted after cleaning. 15 is the
    owner's call (2026-10-22): some people have long names. (It was 10 for a moment, 20 before that.)
  - The server's schema takes names up to `NAME_SENT_MAX` (64), looser on purpose: a phone with an older,
    longer name must still sync its rounds, and `checkName` then stores that name as null.
  - `characters`: letters in any language, digits, spaces and `- _ . '` (and `’`, which iOS types for `'`).
    At least one letter. No emoji.
  - `blocked`: the filter.
- **The filter is a library, not ours** (owner's call, 2026-10-22: don't build a filter from scratch).
  `isBlocked` runs obscenity's `RegExpMatcher` with its English list (about 70 words, each with its own
  harmless exceptions: Scunthorpe, Cassandra, Dickens, Titan) and its recommended transformers (leetspeak,
  look-alike characters, repeated letters: "fuuuck", "Sh1t", "b00bs"). It errs on the side of blocking: a
  blocked player picks another name, and a slur on the leaderboard is far worse.
  - Our part is small: accents off and ß as ss first ("Héil", "Scheiße": the matcher skips letters
    outside a–z, so an accented or ß pattern can never match), and the name is checked twice: with camelCase split
    ("BigDick" → "Big Dick") and with spaces and punctuation removed ("f.u.c.k", "a s s").
  - `EXTRA_WORDS`: what its list leaves out (nazi, hitler, heil, kys, …) and names that pose as the game
    (admin, moderator, official, Hanged, support, staff, mod, …), in obscenity's pattern syntax: `|nazi|` is a
    whole word only (Nazir passes), `nazi[s]` an optional letter. **The library reads a double letter as one,
    except b e o l s g**, so write "official" as `oficial`. That's also why "kkk" can't be blocked (it reads
    as a single "k").
  - **Reserved names** (`RESERVED_NAMES`: "Admin"): blocked by `EXTRA_WORDS` for everyone, and let through by
    `checkName(name, { reserved: true })` only for an account whose server role allows it
    ([dev-accounts.md](dev-accounts.md)). The reducer's name actions and the Profile field pass `nameRules(state)`.
  - `ALLOWED_NAMES`: real names its list blocks (Analise, because of "anal").
  - `UNEXCEPTED`: English-list exceptions that would hide one of our words. Its exceptions apply to every
    pattern, and it excuses "fick" (German abuse), so that one is dropped and only "fickle" is excused.
  - **Adding a word**: add it to `EXTRA_WORDS` (or a name to `ALLOWED_NAMES`), then add it and a harmless
    name that contains it to `server/test/names.test.ts`. Write it as the matcher reads it: no accents
    ("coño" → `cono`), double letters as one ("connard" → `conard`), or it silently never matches.
  - The English list plus common French, Spanish and German abuse in `EXTRA_WORDS`.
- **Names are unique** (owner's call, 2026-10-23). Two names are the same when their `nameKey` is: case,
  accents (and ß as ss), spaces and `- _ . '` don't count, so "Zoë", "zoe" and "Z-O-E" are one name. Only
  the server knows who holds what, and the app is offline first, so it's settled twice:
  - **Online, before saving**: Profile's Save and onboarding's Play ask `GET /v1/names/available`
    (`useNameAvailability` in [PlayerNameInput.tsx](../src/components/PlayerNameInput.tsx), through
    `GameContext.nameIsFree`, 3 s timeout). A taken name shows "Someone already has this name" until the
    field changes. Offline, or on any error, the name goes through.
  - **On sync**: the server gives a name someone else holds the first free variant ("Roda2", cut to fit
    15) and returns it; the reducer's `nameTaken` adopts it and keeps the asked-for name in `takenName`,
    so the Profile card says "“Roda” was taken, so you're Roda2 for now". A rename clears it. If the player
    renamed while that sync was out, the variant is ignored and the next sync sends the new name.
  - Random names are only about 600, so they collide often: they get a number the same way.
- Players can't report a name yet (Guideline 1.2: plan it before the leaderboard goes live).
- **Random names** (`RANDOM_NAMES`): an adjective and a noun from two small, friendly lists, in one word
  ("SunnyOtter"), only the pairs that fit in 10 (about 600, short so they show big), never a character's name. A test checks that
  every one passes `checkName`. `GameProvider` gives one to any save whose `playerName` is null: a new
  player, a save from before names, and a player who just deleted their account.
- **A saved name the rules no longer take** (longer than 15: the limit was 20 at first): `hydrate` keeps its first word if
  that passes ("Roda The Goat" → "Roda"), else drops it for a random one (`keptName`).
- **In the Play header** the name is as big as fits (`nameSize` in GameHeader): the name block takes the room
  left beside the pills, measures it (`onLayout`), and the size is that width over the name's length × 0.62
  (Fredoka Bold's average letter), from 27 down to 14. A 15-character name fits a 375-wide iPhone. The level
  and token pills never shrink, so a name of very wide letters ("WWWWWWWWWWWWWWW") is cut with "…" instead of
  running under them. iOS's `adjustsFontSizeToFit` is not used: on the owner's phone it let the name overflow.
  The Profile card and the leaderboard rows cut a long name with "…".

## Deleting the account (App Store Guideline 5.1.1(v))

"Delete account" opens `DeleteSheet` (the character's worried face, what will be erased, "Delete everything" /
"Keep my account"). The player must type exactly `DELETE` in capital letters before "Delete everything"
is enabled. Closing the sheet clears the confirmation; the keyboard's Done key never deletes the account.
Then `useGame().deleteAccount()`:

1. `sync.deleteAccount()` ([src/net/sync.ts](../src/net/sync.ts)): stops syncs (`latest = null`), waits for
   the one in flight (so it can't bring the old account back), calls `DELETE /v1/players/me`, then removes the
   saved account. A `401` counts as done (already gone). **A player who never synced has no account**: done,
   no network needed.
2. **Offline it changes nothing**: the sheet says deleting needs the internet and stays open. The save is
   only wiped once the server has deleted the player, so nobody ends up with a wiped phone and a live account.
3. The reducer's `reset` (back to `initialState()`) and a new round **in the same batch**: a state without a
   round makes the root `Gate` unmount the whole app. A random name is assigned in the same batch.
   The root route guard returns to onboarding, with identity setup and consent cleared.

The server deletes the `players` row, and `player_weeks` goes with it (`ON DELETE CASCADE`). `word_days`
stays: counts per word and day, nothing points back to the player. The leaderboard's 10 s cache can show
the player until it expires.

## Info pages

`INFO_PAGES` (title, icon, colour) drives both the Profile rows and the page header. An unknown `/info/x`
redirects to Profile.
- **Game rules**: cards in player words, matching CLAUDE.md's rules. **Every number comes from the config**
  (`DEFAULT_MAX_WRONG`, `LETTER_BUY_*`, `STREAK_BONUS_AT[0]`, `LOSSES_TO_DROP`, the
  first level that sells letters / shows the subject, `LEVELS.length`), so a placeholder change updates the
  sheet. A rule change that adds a new idea needs a new card (`RULES` + `rules.*` keys). The last card,
  Versus, points to each mode's own rules (the "?" on its card in the Versus tab, numbers from `MODES`).
- **Credits**: [data/CREDITS.md](../data/CREDITS.md) in player words: Open English WordNet (CC BY 4.0, with
  the list of changes), SCOWL (its full permission notice, which its licence requires), Princeton WordNet. Links
  open in the browser. **If the word sources or CREDITS.md change, change `credits.*` in `en.json` too.**
- **Privacy and terms**: the bundled `LegalDocument` draft, also shown in onboarding's tabbed sheet.
- **Support**: "Coming soon" (`BoardNote`).
