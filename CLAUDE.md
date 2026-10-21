Act as an expert software engineer. When writing code, strictly prioritize high performance and maximum code reuse to ensure the application remains clean, consistent, and scalable. Prefer modular components, dry principles, and efficient algorithms.

# Hanged: word guessing game

**Official name:** "Hanged: word guessing game". This is the name for the game, the App Store listing and the app's display name. Use the short form **"Hanged"** where space is tight, such as the home-screen icon label. The in-game header (Play and Round lost) shows the **player's name**, not the app name. Never call the app "Hangman" in the UI or in store text.

An iOS mobile game built with **Expo (React Native)**. It's a cute, animated take on the classic hangman word game.

- `idea.md` — the owner's original notes. They are the source of truth for the rules.
- `design/ui-mockup.png` — the current UI mockup (Play, Versus, Leaderboard, Characters, Profile and Round lost screens, plus a strip of the 11 hanging stages). It's rendered from `design/ui-mockup.html` at 2730x1420: edit the HTML, then screenshot it again with headless Chrome. The mockup draws every character from `design/characters/rig.js` and `hanging.js`, so changes to the characters show up there automatically.
- `design/characters/`: the 10 character designs. `rig.js` holds the shared rig (joints, parts, poses, expressions) and every character's skin. `characters.html` previews them, and `characters.png` is its headless-Chrome screenshot. All characters must keep the same rig, so one hanging animation works for all of them.
- `design/characters/hanging.js` + `hanging.html`: the 10-stage hanging animation (stage N = N wrong guesses), built on the shared rig. The gallows is already there when the round starts. The character does one step per stage: wave, rope, throw, noose, stool, climb, stand, noose on, wobble, tip. They stay on the stool until stage 10, which is the only stage where they fall and hang. With fewer allowed wrong guesses, show stage `round(wrong * 10 / maxWrong)`.
- `Hangman app_ gameplay, leaderboard, and characters.png` — the first mockup. It's outdated (it still shows hearts and gems), so keep it for reference only.
- Prior art: the owner already built a desktop version in C# WinForms, called "Pendu" (French for hangman): https://github.com/Mudelkun/Pendu. Use it as a reference for the core loop, but **do not port its bugs** (listed below).

**Built so far:** the solo game. That's the Play screen with its round result, the rules engine, the word database (a JSON file for now), tokens and levels, all saved on the device. Versus, Leaderboard, Characters and Profile aren't built yet.

**Stack:** Expo SDK 57 + Expo Router (TypeScript), `react-native-svg`, AsyncStorage. There's **no backend and no state library**: ask the owner before adding either. Details: [Context/dev-setup.md](Context/dev-setup.md).

---

## How to use this file

This file holds the owner's spec (the rules below) and what applies to almost every task. How each built part works lives in `Context/<topic>.md`.

1. **Before changing an area, read its context file** (listed below). It explains how that part works, the invariants and why they exist, and the traps.
2. **If your change alters documented behavior, architecture, workflow, or an important decision, update that context file** as part of the same change. A new part of the project gets its own context file and a row in the map below.
3. Do **not** update unrelated context files, and do **not** copy their detail back into `CLAUDE.md`.

### Context map

| Read this before working on… | File |
|---|---|
| The round rules in code: word validation, clues, guesses, win/loss, hanging stage, the "Pendu" bug tests | [Context/game-engine.md](Context/game-engine.md) |
| Score (words guessed), tokens, description unlock, **levels and their placeholder numbers**, picking the next word, saving on the device | [Context/progression-and-tokens.md](Context/progression-and-tokens.md) |
| The word database: `data/words.json`, how to add words and hint words, the checks, the PostgreSQL move | [Context/word-database.md](Context/word-database.md) |
| How the app draws characters **from `design/characters/*.js`**, the animation loop, the won pose, scene cropping, avatars | [Context/characters-and-animation.md](Context/characters-and-animation.md) |
| The Play screen and the round result: layout, components, compact phones, where the app deliberately differs from the mockup, UI text (i18n) | [Context/play-screen.md](Context/play-screen.md) |
| Stack, commands, lint/TypeScript traps, previewing without a Mac, app name in `app.json` | [Context/dev-setup.md](Context/dev-setup.md) |

### Code layout

```
src/app/            routes (Expo Router): _layout.tsx (fonts, splash, provider), index.tsx (Play)
src/game/           pure rules, no React: engine.ts, progress.ts (reducer), levels.ts, words.ts, config.ts
src/state/          GameContext: the reducer + AsyncStorage
src/characters/     rig.ts: imports design/characters/rig.js + hanging.js (one source for both app and mockup)
src/components/     UI pieces of the Play screen
src/i18n/           all UI text (en.json)
src/theme/          palette and fonts from the mockup
data/words.json     the word database (generated from scripts/words-source.txt)
```

### Rules that apply to every task

- **The game rules live in `src/game/` as pure functions with tests.** UI code asks the engine (`roundStatus`, `keyState`, …) and never re-implements a rule.
- **Score only in the reducer, in the step that wins the round**, never in a screen or an effect ([Context/progression-and-tokens.md](Context/progression-and-tokens.md)).
- **Never fork the characters into `src/`.** Edit `design/characters/*.js`; the app and the mockup both read it.
- **Every UI string goes in `src/i18n/en.json`.**
- Placeholder answers to the open questions (starting tokens, levels, clue ratios) live only in `src/game/config.ts` and `src/game/levels.ts`, and are marked PLACEHOLDER.

---

## Core game rules

1. **A secret word is chosen**: picked at random from the word database (solo), or typed by the other player (two-player mode).
2. **Word constraints**
   - Letters only, A–Z. No spaces, digits, hyphens or accents. Normalize to one case internally (the original used lowercase).
   - Length: 1 to **15** letters, inclusive.
3. **Display**: each hidden letter shows as a blank (dash or empty tile), e.g. `h _ l l _`. Revealed letters appear in their positions.
4. **Clues (pre-revealed letters)**: when a round starts, some letters are already revealed. Every word gets **at least one** clue, and longer words get more.
   - When a letter is revealed as a clue, **all** of its occurrences are shown and that key counts as used.
   - At least one letter must always stay hidden.
5. **A turn** = the player picks one letter on the in-game keyboard.
   - If the letter is in the word, **every** occurrence is revealed.
   - If it isn't, the wrong-guess counter goes up by 1 and the character moves one stage closer to being hanged.
6. **No repeat guesses**: once a letter has been tried, it can't be picked again. Its key is taken out of play (see Keyboard).
7. **Max wrong guesses**: **10** by default. The character is fully hanged at 10 wrong guesses, and the hanging animation has 10 stages plus the starting state. The hardest difficulty levels may allow fewer wrong guesses.
8. **Win**: every letter of the word is revealed before the limit is reached.
   **Lose**: the wrong-guess limit is reached. Show the full word when the player loses.
9. Input locks as soon as the round is won or lost.

### Difficulty

Difficulty **scales progressively**: the game gets harder as the player advances. The player doesn't pick a level.

A level's difficulty is set by:
- **word length**
- **how many clues are given** (fewer clues = harder)
- for the hardest levels, possibly **fewer wrong guesses allowed** (fewer than 10)

### Word descriptions

- **Every word** has a short **description/hint**. The mockup shows a "CLUE" card such as *"A greeting used when meeting someone."*
- The description is **always hidden** when a round starts. The player can unlock it by spending **one token** (see Tokens below). It never costs a wrong guess.

### Hint words

- **Every word** also has a short, limited list of **hint words** (2 to 4, each a single word, e.g. *castle* → king, tower, stone).
- They're **free**, but hidden when a round starts: the player taps to show the first one, and each further tap **loops** to the next (back to the first after the last). They never cost a token or a wrong guess.
- A hint word must not give letters away: it can't contain the word, and the word can't contain it.

### Keyboard

- A custom in-game keyboard with **letters only**. Never use the system keyboard during guessing.
- Letters that have been used become unavailable. The notes say used letters "are gone from the keyboard". The mockup keeps them in place but changes their look: correct letters turn filled mint green, wrong ones turn grey with the letter faded (the owner chose the letter over the mockup's ✕), and clue letters are butter yellow. Follow the mockup unless the owner says otherwise.

---

## Meta-game

### Unlimited play
- There is **no lives/energy system**. The player can play as many rounds as they want, and getting hanged only ends that round.

### Tokens (the only currency)
- The player has a **token** balance. "Token" is a placeholder name until the owner picks a symbol and a name.
- **Earning**: the player gets **1 token for every word guessed correctly**.
- **Spending**: tokens are used for exactly two things:
  1. unlocking a word's description (1 token)
  2. unlocking characters (each character has a price in tokens)
- There are **no gems** in the game. The mockup shows gems, but ignore them.
- The mockup puts a heart counter in the top bar. That spot becomes the token counter, with a **different symbol, not a heart**. Don't use hearts for it, because hearts suggest lives.

### Leaderboard
- Each player's score is **the number of words they have guessed**. Spending tokens never lowers it.
- The leaderboard ranks players by that score and shows it as a plain count, not gems. The mockup has **This week / All time** tabs and highlights the current player with a "YOU" badge.
- Each row shows the player's name and profile picture, or their character's face if they haven't uploaded one (see Profile page).

### Characters
- The player can choose between several cute, animated characters. The hanged figure *is* the character the player selected.
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

- **Player name**: editable. It's public, because it shows on the leaderboard and in online matches.
- **Profile picture**: the player can upload one from the photo library or take one with the camera. Ask for that permission only when the player taps "Change photo". Crop the picture to a circle.
  - Until a picture is uploaded, the avatar is the face of the player's selected character.
  - The profile picture (or that fallback) is the avatar used on the leaderboard and in online matches.
- **Stats**: words guessed, tokens and current level.
- **Settings**
  - App **language**. The MVP lists English only.
  - **Sound effects** and **music** on/off switches. These are my addition, since the game is meant to be full of sound.
- **Info & legal**
  - **Game rules**: an in-app sheet that explains the rules in player-friendly words. It must match the rules in this file.
  - **Privacy policy**: required by the App Store. Apple also needs a public URL for it in App Store Connect.
  - **Terms of use**
  - **Contact / support**
  - The app name ("Hanged: word guessing game") and the version.
- **Delete account**: Apple requires in-app account deletion for any app that lets players create an account (App Store Review Guideline 5.1.1(v)).

Names and photos are public content that players create, so the App Store expects ways to deal with abuse (Guideline 1.2): filter offensive names, let players report someone, and be able to remove bad photos. Plan for this before the leaderboard goes live.

---

## Look and feel

- The provided screenshot is just a basic exemple not the final look of the project

---

## Data the game needs (from the owner's notes)

- **Words**: word, language, short description, hint words, plus whatever difficulty needs (length can be computed from the word).
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

- **Tokens**: what symbol and name should they have? Does a new player start with any? How many tokens does each character cost?
- **Clue formula**: exactly how many letters are revealed for each word length and difficulty level?
- **Progression**: what moves the player up a level (a number of words won, a streak)? How many levels are there? Can the player drop back down after losing?
- **Accents** in languages other than English: strip them to A–Z, add accented keys, or leave those words out?
- **Accounts**: how do players sign in (Sign in with Apple, email, or an anonymous guest who upgrades later)? The leaderboard, profile, tokens and online play all depend on this.
- **Player names**: must they be unique? What length limits apply?
- **App language**: does it change only the UI text, or the word list too?
- **Legal pages**: who writes the privacy policy and terms, and where are they hosted?
- **Online two-player**: how do players find each other (invite a friend, random match, or both)? Do words guessed there count toward the leaderboard and toward earning tokens?
