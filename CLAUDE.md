Act as an expert software engineer. When writing code, strictly prioritize high performance and maximum code reuse to ensure the application remains clean, consistent, and scalable. Prefer modular components, dry principles, and efficient algorithms.

# Hanged: word guessing game

**Official name:** "Hanged: word guessing game". This is the name for the game, the App Store listing and the app's display name. Use the short form **"Hanged"** where space is tight, such as the home-screen icon label. The in-game header (Play and Round lost) shows the **player's name**, not the app name. Never call the app "Hangman" in the UI or in store text.

An iOS mobile game built with **Expo (React Native)**. It's a cute, animated take on the classic hangman word game, with **balloons instead of a gallows**: the character floats under 10 balloons, each wrong guess pops one, and after the last one they land hard on the ground (funny, never hurt). The owner changed the concept from hanging to balloons; the app's name may change too (not decided).

- `idea.md` — the owner's original notes. They are the source of truth for the rules.
- `design/ui-mockup.png` — the current UI mockup (Play, Versus, Leaderboard, Characters, Profile and Round lost screens, plus a strip of the 11 old hanging stages: the mockup has not been redrawn for the balloons yet). It's rendered from `design/ui-mockup.html` at 2730x1420: edit the HTML, then screenshot it again with headless Chrome. The mockup draws every character from `design/characters/rig.js` and `hanging.js`, so changes to the characters show up there automatically.
- `design/characters/`: the 15 character designs. `rig.js` holds the shared rig (joints, parts, poses, expressions) and every character's skin and persona (signature pose and attitude for the Characters page). `characters.html` previews them, and `characters.png` is its headless-Chrome screenshot. `avatars.html` (+ `avatars.png`) previews each character's profile picture (`HangedRig.avatar`). All characters must keep the same rig, so one animation works for all of them.
- `design/characters/balloons.js` + `balloons.html` (+ `balloons.png`): **the animation the app uses**. 10 stages, built on the shared rig. A round shows **one balloon per allowed miss** and every miss pops exactly one (`balloonsGone`). Each pop sinks the character a little more; at stage 10 the last balloon pops, they hang in the air for a beat, fall, and land hard on their bottom (squash, shake, bounce, dust, cracks), then sit dazed with stars. With fewer allowed wrong guesses, the pose stage is `round(wrong * 10 / maxWrong)`.
- `design/characters/hanging.js` + `hanging.html`: the **old** 10-stage hanging animation, kept only because the mockup still draws it. The gallows is already there when the round starts. The character does one step per stage: wave, rope, throw, noose, stool, climb, stand, noose on, wobble, tip. They stay on the stool until stage 10, which is the only stage where they fall and hang. With fewer allowed wrong guesses, show stage `round(wrong * 10 / maxWrong)`.
- `design/world/world.js`: **the level path's world** (terraces over the clouds, the castle at the top), drawn by the app's level map and level-up card and by the preview `design/level-top.html` (+ `level-top.png`). Same idea as the characters: edit it there, never a copy in `src/`.
- `Hangman app_ gameplay, leaderboard, and characters.png` — the first mockup. It's outdated (it still shows hearts and gems), so keep it for reference only.
- Prior art: the owner already built a desktop version in C# WinForms, called "Pendu" (French for hangman): https://github.com/Mudelkun/Pendu. Use it as a reference for the core loop, but **do not port its bugs** (listed below).

**Built so far:** the solo game. That's the Play screen with its round result, the rules engine, the word database (a JSON file in the app), tokens and levels, all saved on the device. Also the **Leaderboard** tab and the small **server** behind it (players, leaderboard, word statistics), ready to deploy on Railway, the **Characters** tab (buy characters with tokens and pick one, all on the device), and the **Profile** page (name, stats, info and legal pages, account deletion). Versus isn't built yet.

**Stack:** Expo SDK 57 + Expo Router (TypeScript), `react-native-svg`, AsyncStorage. A Node + PostgreSQL server in `server/` (Railway) for the leaderboard and word statistics only. **No state library**: ask the owner before adding one, or before the game depends on the server for anything else (see Offline first). Details: [Context/dev-setup.md](Context/dev-setup.md), [Context/server.md](Context/server.md).

---

## How to use this file

This file holds the owner's spec (the rules below) and what applies to almost every task. How each built part works lives in `Context/<topic>.md`.

1. **Before changing an area, read its context file** (listed below). It explains how that part works, the invariants and why they exist, and the traps.
2. **If your change alters documented behavior, architecture, workflow, or an important decision, update that context file** as part of the same change. A new part of the project gets its own context file and a row in the map below.
3. Do **not** update unrelated context files, and do **not** copy their detail back into `CLAUDE.md`.

### Context map

| Read this before working on… | File |
|---|---|
| The round rules in code: word validation, clues, guesses, win/loss, scene stage, the "Pendu" bug tests | [Context/game-engine.md](Context/game-engine.md) |
| Score (words guessed), tokens, **levels and their placeholder numbers**, picking the next word, saving on the device | [Context/progression-and-tokens.md](Context/progression-and-tokens.md) |
| The word database: `data/words.json`, how to add words, the checks, why words stay on the device | [Context/word-database.md](Context/word-database.md) |
| How the app draws characters **from `design/characters/*.js`**, the personas (signature poses, elbows, props), the balloon stages, the animation loop, the won pose, the scene camera, avatars | [Context/characters-and-animation.md](Context/characters-and-animation.md) |
| The Play screen and the round result: layout, components, the streak takeover and level path, compact phones, where the app deliberately differs from the mockup, UI text (i18n) | [Context/play-screen.md](Context/play-screen.md) |
| The server (`server/`): API, database, anonymous accounts, round reports and the sync, word statistics, deploying on Railway | [Context/server.md](Context/server.md) |
| The Leaderboard screen, the ranking rules, and how the bottom tabs work | [Context/leaderboard.md](Context/leaderboard.md) |
| The Characters page: character prices (and why), buying and picking, ownership in the save, every place the character shows | [Context/characters-shop.md](Context/characters-shop.md) |
| The Profile page: player names (the filter, random names), the info and legal pages, deleting the account | [Context/profile.md](Context/profile.md) |
| Music, sound effects, character voices, and standalone listening previews awaiting approval | [Context/audio-design.md](Context/audio-design.md) |
| Stack, commands, lint/TypeScript traps, previewing without a Mac, app name in `app.json` | [Context/dev-setup.md](Context/dev-setup.md) |

### Code layout

```
src/app/            routes (Expo Router): _layout.tsx (fonts, splash, provider), (tabs)/index.tsx (Play), (tabs)/leaderboard.tsx, (tabs)/characters.tsx, profile.tsx, info/[page].tsx
src/game/           pure rules, no React: engine.ts, progress.ts (reducer), levels.ts, words.ts, config.ts
src/state/          GameContext: the reducer + AsyncStorage + server sync; useLeaderboard
src/net/            the only code that talks to the server: api.ts, sync.ts
src/characters/     rig.ts: imports design/characters/rig.js + balloons.js (one source for both app and previews)
src/world/          world.ts: imports design/world/world.js (the level path's world), parses it in bands
src/components/     UI pieces of the screens
src/i18n/           all UI text (en.json)
src/theme/          palette and fonts from the mockup
data/words.json     the word database (built by scripts/check-words.js: hand-written words + generated from the dictionaries)
server/             the API (its own package, deployed on Railway): src/contract.ts is shared with the app
```

### Rules that apply to every task

- **The game rules live in `src/game/` as pure functions with tests.** UI code asks the engine (`roundStatus`, `keyState`, …) and never re-implements a rule.
- **Score only in the reducer, in the step that wins the round**, never in a screen or an effect ([Context/progression-and-tokens.md](Context/progression-and-tokens.md)).
- **Never fork the characters into `src/`.** Edit `design/characters/*.js`; the app and the mockup both read it.
- **Every UI string goes in `src/i18n/en.json`.**
- Placeholder answers to the open questions (starting tokens, levels, letters to find) live only in `src/game/config.ts` and `src/game/levels.ts`, and are marked PLACEHOLDER.

---

## Core game rules

1. **A secret word is chosen**: picked at random from the word database (solo), or typed by the other player (two-player mode).
   - Solo words come in a random order, and a word is **never shown twice** until the player has gone through every word available at their level.
2. **Word constraints**
   - Letters only, A–Z. No spaces, digits, hyphens or accents. Normalize to one case internally (the original used lowercase).
   - Length: 1 to **15** letters, inclusive.
3. **Display**: each hidden letter shows as a blank (dash or empty tile), e.g. `h _ l l _`. Revealed letters appear in their positions.
4. **Clues (pre-revealed letters)**: when a round starts, some letters are already revealed. Every word gets **at least one** clue, and longer words get more. **The player always has letters to find: from level 3, a long word (8+ letters) never leaves fewer than 3**, and more as levels rise (owner's call, 2026-10-22: 2 letters to find in a 12-letter word is no game). The clues are placed to help: a long word's first two clues are **its first two letters or its last two** (front or back at random), because a word's start or ending is what people recognise it by, and the other clues are **the word's rarest letters** (the V or J nobody tries), so the letters left to find are ones a player can find.
   - When a letter is revealed as a clue, **all** of its occurrences are shown and that key counts as used.
   - At least one letter must always stay hidden.
5. **A turn** = the player picks one letter on the in-game keyboard.
   - If the letter is in the word, **every** occurrence is revealed.
   - If it isn't, the wrong-guess counter goes up by 1 and one of the character's balloons pops.
6. **No repeat guesses**: once a letter has been tried, it can't be picked again. Its key is taken out of play (see Keyboard).
7. **Max wrong guesses**: **10** by default. The last balloon pops at 10 wrong guesses, and the balloon animation has 10 stages plus the starting state. The hardest difficulty levels may allow fewer wrong guesses.
8. **Win**: every letter of the word is revealed before the limit is reached.
   **Lose**: the wrong-guess limit is reached. Show the full word when the player loses.
9. Input locks as soon as the round is won or lost.

### Difficulty

Difficulty **scales progressively**: the game gets harder as the player advances. The player doesn't pick a level.

A level's difficulty is set by:
- **word length**
- **how many clues are given** (fewer clues = harder)
- for the hardest levels, possibly **fewer wrong guesses allowed** (fewer than 10)
- **Dropping back down**: losing **3 rounds in a row** moves the player down one level (never below level 1). The first few rounds on a new level never count toward a drop. The result screen says so gently ("Back to level N"), not as a penalty. The leaderboard score never goes down.
- **Each level has its own colour.** A level change plays an animation: a path of numbered stops, one colour per level, that the player's character climbs up or slides back down.
- for the easiest levels, **disabled letters**: some letters that are *not* in the word are taken off the keyboard when the round starts, so there are fewer wrong keys to hit. Each higher level disables fewer, down to the full keyboard. At least one wrong letter always stays pickable.
- **20 levels** (owner's call, 2026-10-22). **Levels 1–15 deal only everyday, familiar words** (owner's call, 2026-10-22); they get harder through longer words and more letters to find. **From level 16, less familiar words come in, a few more each level.** The help grows too: the word's **subject** (e.g. "Animal", "Material") is shown for free from level 9, and letters can be bought from level 8. The game should feel like a game, never like homework. The goal: **a regular person (not a word expert) wins about 75% of rounds on levels 1–15**, and more than they lose on 16–20, checked by a simulation test ([Context/progression-and-tokens.md](Context/progression-and-tokens.md)).

### Word descriptions

- **Every word** has a **description/hint**. The mockup shows a "CLUE" card such as *"A greeting used when meeting someone."*
- Descriptions come from a **trusted dictionary**, never written by hand or by an AI: today Open English WordNet (CC BY 4.0, so the app must credit it). They must not contain the word itself.
- The description is **always visible for free**, from the start of every round and on the result screen. There is no reveal button, token cost or wrong-guess penalty.

### Keyboard

- A custom in-game keyboard with **letters only**. Never use the system keyboard during guessing.
- Letters that have been used become unavailable. The notes say used letters "are gone from the keyboard". The mockup keeps them in place but changes their look: correct letters turn filled mint green, wrong ones turn grey with the letter faded (the owner chose the letter over the mockup's ✕), and clue letters are butter yellow. Letters disabled by an easy level show as an empty dashed slot, so the layout doesn't shift. Follow the mockup unless the owner says otherwise.

---

## Meta-game

### Unlimited play
- There is **no lives/energy system**. The player can play as many rounds as they want, and losing all the balloons only ends that round.

### Offline first (owner's call, 2026-10-21)
- The solo game works **fully offline**, at every level. The words, rounds, tokens, levels, characters and settings all live on the device, and **the device is the source of truth**.
- The player needs the internet for only two things: **seeing the leaderboard**, and **sending their stats** so they're ranked in the right place. Stats wait on the device until a connection comes back, and play never waits for them. Two-player mode is online by nature and is the exception.
- **No server serves words.** They ship inside the app. The server also collects word statistics (which words are guessed or lost most), but the game never depends on them.

### Tokens (the only currency)
- The player has a **token** balance. "Token" is a placeholder name until the owner picks a symbol and a name.
- **Earning**: every word guessed correctly pays tokens. **Harder levels pay more per word** (the owner chose this so easy words, which are easy to guess in a row, can't out-earn hard ones). **Words guessed in a row add a small bonus** on top: +1 token from 3 in a row, +2 from 6, +3 from 10. Losing a round resets the streak, so the next win pays no bonus.
- **Spending**: tokens are used for exactly two things:
  1. on the hard levels (8 and up): revealing 2 hidden letters for 15 tokens, once per round. All occurrences show, and at least one letter always stays hidden.
  2. unlocking characters (each character has a price in tokens)
- There are **no gems** in the game. The mockup shows gems, but ignore them.
- The mockup puts a heart counter in the top bar. That spot becomes the token counter, with a **different symbol, not a heart**. Don't use hearts for it, because hearts suggest lives.

### Leaderboard
- Each player's score is **the number of words they have guessed**. Spending tokens never lowers it.
- The leaderboard ranks players by that score and shows it as a plain count, not gems. Ties go to the higher level, then to whoever got there first. Tokens never count toward the rank: spending them must not lower it. The mockup has **This week / All time** tabs and highlights the current player with a "YOU" badge.
- Each row shows the player's name and profile picture, or their character's face if they haven't uploaded one (see Profile page).

### Characters
- The player can choose between several cute, animated characters. The figure under the balloons *is* the character the player selected.
- Some characters are free. The others are locked and are unlocked by spending **tokens**.

### Two-player mode (online)
- Two-player mode is **online**: the two players are on separate devices. This means the game needs a backend with real-time sync, so check with the owner before picking one.
- The players take turns. One player picks a word from the list or types their own, and the other player guesses it.
- A typed word must pass the same word constraints (letters only, at most 15). It's checked before it's sent, and the server never shows it to the guesser.

### Languages
- The **MVP is English only**.
- Later, the player will be able to pick a language on the **Profile page**. Store a language with every word from day one, and don't hard-code English assumptions into the game logic. Keep all UI text in translation files, not hard-coded in components.
- How accented letters will work in other languages hasn't been decided yet. For the English MVP, the A–Z rule applies.

### Profile page
This is the player's own page. It holds personal customization, app settings, and all the info and legal pages.

- **How the player gets there:** Profile is **not** a bottom tab. The player taps their **avatar button** at the top-left of the Play, Leaderboard and Characters screens, and Profile opens as a pushed screen with a back button.
- **Navigation rule:** the bottom tab bar has **at most 4 items**: Play · Versus · Leaderboard · Characters. Any new section needs a different entry point, such as a header button or a link inside an existing screen. Never add a fifth tab.

- **Player name**: editable, and the only thing the player edits here. It's public, because it shows on the leaderboard and in online matches, so it's **filtered** (offensive words, names that pose as the game) on the device and again on the server. At most **15 characters**, for long real names; the Play header shrinks a long name to fit. A new player gets a **random friendly name** ("SunnyOtter"); onboarding will ask for a name later (owner's calls, 2026-10-22).
- **Profile picture: not for now** (owner's call, 2026-10-22). No uploads, to keep out user-uploaded content and the privacy work it brings: the avatar is the face of the player's selected character, everywhere, and "Change character" replaces "Change photo". Kept for later: the player can upload one from the photo library or take one with the camera. Ask for that permission only when the player taps "Change photo". Crop the picture to a circle.
  - Until a picture is uploaded, the avatar is the face of the player's selected character.
  - The profile picture (or that fallback) is the avatar used on the leaderboard and in online matches.
- **Stats**: words guessed, tokens and current level.
- **Settings**
  - App **language**. The MVP lists English only.
  - **Sound effects** and **music** on/off switches. These are my addition, since the game is meant to be full of sound. **Not shown until the game has sound** (owner's call, 2026-10-22).
- **Info & legal**
  - **Game rules**: an in-app sheet that explains the rules in player-friendly words. It must match the rules in this file.
  - **Privacy policy**: required by the App Store. Apple also needs a public URL for it in App Store Connect.
  - **Terms of use**
  - **Contact / support**
  - These three pages exist but stay blank ("Coming soon") until their texts are written (owner's call, 2026-10-22).
  - **Credits**: the dictionary the descriptions come from ([data/CREDITS.md](data/CREDITS.md)). Its licence requires it.
  - The app name ("Hanged: word guessing game") and the version.
- **Delete account**: Apple requires in-app account deletion for any app that lets players create an account (App Store Review Guideline 5.1.1(v)).

Names and photos are public content that players create, so the App Store expects ways to deal with abuse (Guideline 1.2): filter offensive names, let players report someone, and be able to remove bad photos. Names are filtered now and there are no photos; reporting a player is still to plan before the leaderboard goes live.

---

## Look and feel

- The provided screenshot is just a basic exemple not the final look of the project

---

## Data the game needs (from the owner's notes)

- **Words**: word, language, short description, plus whatever difficulty needs (length can be computed from the word).
- **Players**: identity, name, profile picture (an image stored on the server), score (words guessed), token balance, current level, and settings (language, sound, music). This is what feeds the leaderboard.
- **Characters**: catalogue, token price, which characters the player has unlocked, and their current selection.

---

## C# "Pendu" reference: what to keep, what not to port

How the original works (`Pendu/Form1.cs`): one player types the word, and the word is shown as dashes (`CacherMontrer`). Each guessed letter is checked against the word. A miss increments `tries` and swaps the gallows image (`pendu0`…`pendu10`). The player wins when every letter of the word is in the guessed set (`gagner`).

**Known bugs, do NOT reproduce them:**
- `mot.Length < 15` rejects 15-letter words. The rule is **≤ 15**.
- `char.IsLetter` accepts accented and Unicode letters. The rule is plain A–Z.
- Tried letters are stored in a fixed `char[11]`, so after 11 guesses repeats are no longer blocked. Track tried letters in a set.
- There's no proper loss state. At 10 misses the input stays enabled, and the `tries >= 9` check only fires on the *next* guess, which resets the picture to `pendu0` without showing a "lost" message.
- No clue letters are revealed at the start.

---

## Open questions (ask the owner, don't guess)

- **Tokens**: what symbol and name should they have? Does a new player start with any? Character prices use the steady pace chosen on 2026-10-22: 2 free characters, then 50 to 1,100 tokens, targeting the first paid unlock in 20-30 rounds and the full collection in 1,500-2,000 for a regular player (tuning and model: [Context/characters-shop.md](Context/characters-shop.md).)
- **Token amounts**: how many tokens should each level pay, and at which streak lengths should the bonus grow? Placeholders for now: 1 to 4 tokens per level, +1 at 3, 6 and 10 in a row.
- **Clue formula**: exactly how many letters are revealed for each word length and difficulty level? (Decided: each level sets how many letters are left to find, never fewer than 3 in a long word from level 3; clues are a long word's first or last two letters, then the word's rarest letters. The numbers per level and how long counts as long (8 letters) are placeholders.)
- **Progression**: what moves the player up a level (a number of words won, a streak)? (Decided: 20 levels, and dropping down after 3 losses in a row. The exact numbers are placeholders.)
- **Accents** in languages other than English: strip them to A–Z, add accented keys, or leave those words out?
- **Accounts**: how do players sign in (Sign in with Apple, email, or an anonymous guest who upgrades later)? (For now: an anonymous id made on the first sync, [Context/server.md](Context/server.md).) The leaderboard, profile, tokens and online play all depend on this.
- **Player names**: must they be unique? (For now: not unique, 2 to 15 characters (owner's call), letters in any language, digits, spaces and `- _ . '`: [Context/profile.md](Context/profile.md).)
- **App language**: does it change only the UI text, or the word list too?
- **Legal pages**: who writes the privacy policy and terms, and where are they hosted?
- **Online two-player**: how do players find each other (invite a friend, random match, or both)? Do words guessed there count toward the leaderboard and toward earning tokens?
