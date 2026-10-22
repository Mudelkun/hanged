# Word database

The database is a JSON file **bundled with the app**, and it stays there (owner's call, 2026-10-21:
offline first). **No server serves words**: the player can play every level without a connection.
New words ship with app updates. The server only keeps a copy of the list to label the word
statistics ([server.md](server.md)).

- Data: [data/words.json](../data/words.json) (generated, don't hand-edit). One word per line, so the
  ~27,000-word file stays readable and diffs line by line.
- Hand-written words: [scripts/words-source.txt](../scripts/words-source.txt), one `word | sense` per line.
- Generated words: [scripts/auto-words.js](../scripts/auto-words.js) (below). Terms kept out of the
  game: [scripts/blocked-words.txt](../scripts/blocked-words.txt).
- Builder/checker: [scripts/check-words.js](../scripts/check-words.js); the rules both share:
  [scripts/words-rules.js](../scripts/words-rules.js); difficulty: [scripts/difficulty.js](../scripts/difficulty.js). Sources, downloaded once into `scripts/.cache/`
  (gitignored) by [scripts/download.js](../scripts/download.js): [scripts/wordnet.js](../scripts/wordnet.js)
  (Open English WordNet + Princeton sense counts) and [scripts/scowl.js](../scripts/scowl.js) (SCOWL).
- Access: [src/game/words.ts](../src/game/words.ts), the **only** module that reads the
  file. If words ever arrive as downloaded packs, that is the one place to change.

## Shape

```json
{"id":"en-castle","word":"castle","language":"en","description":"A large building formerly occupied by a ruler and fortified against attack.","sense":"oewn-02983900-n","rarity":10,"concrete":true,"subject":"object","difficulty":1}
```

- `id` = `<language>-<word>`, stable. `seenWordIds` in the saved game refers to it,
  so keep the ids when migrating.
- `word` is lowercase a–z. Length isn't stored: it's computed (CLAUDE.md).
- `language` is on **every** word from day one, even though the MVP is English only.
- `description` is the clue always shown for free. It's required, and it comes
  from a dictionary (below), never written by hand.
- `sense` is the dictionary sense the description comes from.
- `rarity` is how common the word is, `concrete` whether it's a thing you can picture, and
  `difficulty` how many misses it costs a typical player (see How hard a word is, below). Levels use
  all three to pick words, and words that measure hard get more clues.
- `subject` is a key for the word's broad subject ("animal", "material", "feeling", "describing"…),
  shown for free from level 9 (owner's call). It comes from the sense's WordNet category, grouped
  by `subjectOf` in [words-rules.js](../scripts/words-rules.js); the checker accepts only the keys in
  `SUBJECTS`. **A key, not text**: the label belongs in the app's translations (`subjects.<key>`),
  so another language reuses the same subjects. WordNet's precise subjects ("chemistry", "music")
  cover only 4% of words and some are wrong (it links "capricious" to sexual activity), so the broad
  category is what every word can have: magnesium is "material", virulent "describing".

## Descriptions come from a dictionary (owner's call)

**Why:** the owner wants longer, more formal and accurate descriptions from a trusted source,
not text an AI wrote. The source is **Open English WordNet 2025** (https://en-word.net), the
maintained successor of Princeton WordNet.
- **Licence: CC BY 4.0.** Commercial use is fine, but the app **must credit it**:
  [data/CREDITS.md](../data/CREDITS.md) holds the credit and the list of changes. Profile → Credits shows
  it (`credits.*` in `en.json`: keep them in step with CREDITS.md). Don't switch to Wiktionary
  (CC BY-SA: share-alike) or Merriam-Webster/Oxford (non-commercial or paid) without asking the owner.
- Each source line pins one **sense** (a WordNet synset id such as `02983900-n`), because most
  words have several meanings (castle: the building, the chess piece, the chess move). Pick the
  familiar meaning intended for the game.
- The build copies that sense's definition **verbatim**, except: a leading label such as
  "(astronomy)" goes, `;`-separated clauses that give the word away are dropped ("the coldest season
  of the year; … from the winter solstice …"), then trailing clauses until it fits, and it's
  sentence-cased with a full stop. Nothing is reworded.
- The dictionary (~11 MB) is downloaded on the first `--build` into `scripts/.cache/` (gitignored).
  The app never reads it: `words.json` carries the finished text.
- A game word may be a plural or `-ing` form of the dictionary entry ("fireworks", "grandchildren",
  "troubleshooting"), or drop its spaces ("roller coaster" → rollercoaster).
- **Words without a usable sense were removed** (2026-10-21): teacher, blueberry, jellyfish,
  friendship, photographer, construction, encyclopedia, paleontologist. Every definition of them
  spelled out the word ("a person whose occupation is teaching") or was too long for the card.
  rose and orange now mean the colours.

## Generated words (2026-10-22)

**Why:** the owner wants as many English words as possible, partly to know how many words a language
needs before adding others. Hand-picking a sense for every word doesn't scale, so
`--build` adds every common English word it can describe from the dictionaries
([auto-words.js](../scripts/auto-words.js)). Today: **183 hand-written + 26,388 generated = 26,571 words**.

- **Which words:** OEWN lemmas of 3–15 letters a–z, not capitalised (no names), that SCOWL lists at
  size ≤ 50 (common to medium) in its `english` or `american` lists. American spelling only, so
  "color" and "colour" don't both appear. Plurals the dictionary lists as words ("hands", "years") are
  dropped when the singular noun was used at least as often ("physics" and "species" stay).
- **Which sense:** OEWN's XML doesn't order senses by use (bank's first listed sense is "the
  responsibility of a bank…"), so senses are ordered by **Princeton WordNet 3.0's tag counts**
  (`cntlist.rev`; OEWN sense ids map to its keys). The word takes the most used sense that gives a
  usable description, **among its main senses only**: the most used one, or one of
  the next two if it was ever tagged. A word whose main senses all fail is left out rather than given an
  odd meaning (elephant would otherwise be "the symbol of the Republican Party").
- **Kept out**: words with any sense the dictionary labels obscenity or ethnic slur; senses labelled
  disparagement, slang, archaism, trademark, plural or acronym; and any word that is, or whose
  description uses, a term in [blocked-words.txt](../scripts/blocked-words.txt) (sexual, drug,
  violent, hurtful). That list catches what the labels miss (OEWN even links "capricious" to sexual
  activity). Its cost is a few innocent words ("child" is "a young person of either **sex**"): add
  those by hand with another sense, as child is.
- **Hand-written words win**: a word in `words-source.txt` keeps its sense. It isn't
  checked against the blocked list, so review those by eye.
- The build is deterministic: the sources are pinned releases, so rebuilding gives the same file.
  Changing the generator's rules can drop words. That's fine for ids (see below), but say so in the commit.

## How hard a word is: rarity, kind and difficulty

`rarity` is SCOWL's size for the word: **10** (the most common), 20, 35, 40, **50** (a medium
dictionary). Hand-written words count as 10: they were picked as words everyone knows, and SCOWL,
counted from adult text, rates "owl" or "zebra" 35.

`concrete` is true for a thing you can picture: the sense is in one of WordNet's categories
for animals, food, plants, the body, made things, natural things, materials or people
(`CONCRETE_LEXFILES` in auto-words.js). Phenomena, places and times are left out, because they mix
"storm" with "effect". Hand-written words count as concrete, for the same reason as their rarity.
6,569 words are concrete.

`difficulty` is **how many misses the word costs a typical player**, measured at build time by
[scripts/difficulty.js](../scripts/difficulty.js) (no clues, no miss limit). The simulated player knows
the everyday words (rarity ≤ 20): each turn it keeps those that fit the pattern and tries the letter
most of them share. When none fit, it tries the most frequent English letters, the way people do
with a word they don't think of. castle costs 1, cat 3, badly 5, **virulent 11, magnesium 13**.
Commonness alone misses this: virulent and magnesium are rarity 35 like "zebra", but V, G and M are
letters nobody tries early. The measure is pessimistic about some familiar words outside the
everyday ~10,000 ("armchair" 8). That only shrinks pools, which are big. It's deterministic, takes
~10 s of the build, and must be re-run (`--build`) whenever the word list changes, since it depends
on the whole list.

**Why (2026-10-22):** after the list grew to 21,869 words, the owner found the game far too hard and
ran out of tokens, and lost on "magnesium" (level 7) and "virulent" (level 6). In order:
1. Only ~20% of what the easy levels dealt were things. The rest were common but abstract words
   ("badly", "always", "adhere") that hangman hints can't point at. So levels 1–4 deal only things
   (`concreteOnly`).
2. Levels 7–8 dealt rare words with only 8 and 6 misses. Now every level allows 10 misses and **no
   level deals rare words** (rarity 50, "cynosure"): `maxRarity` stops at 40, on level 20 only. The rare words stay
   in the database (they count toward the language's size, and Versus may use them).
3. Words like virulent were still dealt. Now each level has a `maxDifficulty` (4 on level 1 up to
   8 on level 8), and words measured hard got **more clue letters** (owner's request). Since the
   letters-to-find change (same day), every word's clues are its rarest letters, so a hard word's hard
   letters are always the ones revealed.
All these numbers are PLACEHOLDERS in [levels.ts](../src/game/levels.ts) and [config.ts](../src/game/config.ts),
see [progression-and-tokens.md](progression-and-tokens.md).

The owner later made descriptions **always visible for free at every level** and removed hint words
(2026-10-22). Rewards are unchanged; shop prices now follow the steady pace in [characters-shop.md](characters-shop.md). The target remains that
**players win more rounds than they lose**.

**Measured, not guessed:** two simulated players play real rounds through the real rules (no descriptions). The first is a word-matcher who knows every common word, 60% of rarity-35 words and a
quarter of the rare ones. The second just tries letters by English frequency, a pessimistic bound for
a real person. Before these changes, levels 7–8 gave them 70–72% and 31–43% wins. Now they win 99–100% and
57–97% on every level. On the level ladder over time, the weaker player now reaches level 8 and wins
**68%** of rounds (57% before, stuck around levels 4–5). Re-run such a simulation before making levels harder.

**Everyday words up to level 15 (owner, 2026-10-22):** levels 1–15 deal only rarity 10–20 words, the
ones people use every day. Levels 9–15 used to deal climbing bands of hard-to-guess words, which were
mostly rarity-35 words ("disambiguate"). Less familiar words now come in from level 16 (rarity 35, then
40 on level 20), more on each level: see [progression-and-tokens.md](progression-and-tokens.md), 20 levels.

**Removing hint words (2026-10-22):** the source format is now `word | sense`; the builder,
checker, bundled entries and rounds no longer need or carry hints. The rebuilt list gains 4,702
words whose definitions are usable without hint-word requirements, with no removed ids. 398
existing generated entries now use an earlier main sense that previously failed hint selection.
Difficulty is remeasured against the whole list. The existing level-balance tests pass without
changing any level settings or rewards. Shop prices were subsequently adjusted for the steady unlock pace.

Words per level after this rebuild: 1: 268; 2: 455; 3: 477; 4: 587; 5: 3,592; 6: 4,420;
7: 4,672; 8-15: 4,710; 16: 8,168 (68% everyday); 17: 10,474 (53%); 18: 13,446 (41%);
19: 15,281 (36%); 20: 17,210 (32%).

## Adding or changing words

Most words need nothing. If a common word is missing, it's usually because no main sense gave a
usable description (`noSense` in the build's "Left out" counts). To add it,
or to fix a generated word's sense, write it by hand:

1. `npm run check:words -- --senses <word>` lists the word's senses, most used first, with the
   description each would give, or `(unusable)`.
2. Add `word | sense` to `scripts/words-source.txt`.
3. Run `npm run check:words -- --build`. This regenerates `data/words.json` and validates it.
4. After the release, run `cd server && DATABASE_URL=… npm run seed:words` so the server's statistics
   can show the new words by name ([server.md](server.md)).

To keep a generated word out, add it (or the term that makes it unsuitable) to
`blocked-words.txt` and rebuild.

The build fails on a sense that doesn't exist, that isn't for this word, or whose definition
is unusable. The check fails on any word that:

- isn't 1–15 lowercase a–z,
- has fewer than **2 distinct letters**, so no clue would fit (see [game-engine.md](game-engine.md)),
- has no dictionary `sense`,
- has a `rarity` that isn't one of SCOWL's sizes 10, 20, 35, 40, 50, or a `concrete` that isn't true/false,
- has a missing description, or **a description that gives the word away**: any word in it that
  starts with the answer ("roses"), or shares most of its stem (at least 4 letters and 60% of the
  word: "paleontology" for paleontologist, "dancing" for dance). Compound parts are allowed
  ("light" in a lighthouse's description): the owner's rule is only "not the word itself",
- has a description over **140 characters**, the 4 lines the card shows on a 375 pt phone
  ([play-screen.md](play-screen.md)),
- has a duplicate id.

It also prints how many words there are at each length and rarity. **Every level in
`src/game/levels.ts` needs words in its length range, kind and rarity cap.** A test (`has words for
every level`) fails if a level has none. Today there are 26,571 words of 3–15 letters: from 469 of 3 letters
up to 4,137 of 7, and still 143 of 15.

## Why the words stay on the device

The owner's call is **offline first**. Bundling the words also costs nothing to serve. The rebuilt 26,571
words use about 5.7 MB of JSON (1.1 MB gzipped); the old Hermes bytecode measurements predate
this rebuild and need remeasuring for a release. Another language adds to the bundle, so if several languages ship, load only the
player's language ([words.ts](../src/game/words.ts) is the one place to change). Fetching words per round or in batches would put load on
the server and break offline play. It would also make the "never repeat" rule depend on the server
knowing what each player has seen. The **ids are the contract** with the server (`word_days.word_id`),
so never rename an id: retire the word and add a new one.
