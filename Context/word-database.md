# Word database

For now the database is a JSON file bundled with the app. It will move to PostgreSQL.

- Data: [data/words.json](../data/words.json) (generated, don't hand-edit).
- Source: [scripts/words-source.txt](../scripts/words-source.txt), one `word | sense | hint, hint, hint` per line.
- Builder/checker: [scripts/check-words.js](../scripts/check-words.js). Dictionary loader:
  [scripts/wordnet.js](../scripts/wordnet.js).
- Access: [src/game/words.ts](../src/game/words.ts), the **only** module that reads the
  file, so the PostgreSQL move touches one place.

## Shape

```json
{ "id": "en-castle", "word": "castle", "language": "en", "description": "A large building formerly occupied by a ruler and fortified against attack.", "hints": ["king", "tower", "stone"], "sense": "oewn-02983900-n" }
```

- `id` = `<language>-<word>`, stable. `seenWordIds` in the saved game refers to it,
  so keep the ids when migrating.
- `word` is lowercase a–z. Length isn't stored: it's computed (CLAUDE.md).
- `language` is on **every** word from day one, even though the MVP is English only.
- `description` is the hint the player can unlock for tokens. It's required, and it comes
  from a dictionary (below), never written by hand.
- `sense` is the dictionary sense the description comes from.
- `hints` are the free one-word hints the player loops through (CLAUDE.md, Hint words).
  2–4 per word, required. Every word has 3 today. They are still hand-written.

## Descriptions come from a dictionary (owner's call)

**Why:** the owner wants longer, more formal and accurate descriptions from a trusted source,
not text an AI wrote. The source is **Open English WordNet 2025** (https://en-word.net), the
maintained successor of Princeton WordNet.
- **Licence: CC BY 4.0.** Commercial use is fine, but the app **must credit it**:
  [data/CREDITS.md](../data/CREDITS.md) holds the credit and the list of changes. Show it on the
  Profile page's Info & legal section when that's built. Don't switch to Wiktionary
  (CC BY-SA: share-alike) or Merriam-Webster/Oxford (non-commercial or paid) without asking the owner.
- Each source line pins one **sense** (a WordNet synset id such as `02983900-n`), because most
  words have several meanings (castle: the building, the chess piece, the chess move). Pick the
  sense the hints point to.
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
  rose and orange now mean the colours (their hints were changed to match).

## Adding or changing words

1. `npm run check:words -- --senses <word>` lists the word's senses with the description each
   would give, or `(unusable)`.
2. Add `word | sense | hint, hint, hint` to `scripts/words-source.txt`.
3. Run `npm run check:words -- --build`. This regenerates `data/words.json` and validates it.

The build fails on a sense that doesn't exist, that isn't for this word, or whose definition
is unusable. The check fails on any word that:

- isn't 1–15 lowercase a–z,
- has fewer than **2 distinct letters**, so no clue would fit (see [game-engine.md](game-engine.md)),
- has no dictionary `sense`,
- has a missing description, or **a description that gives the word away**: any word in it that
  starts with the answer ("roses"), or shares most of its stem (at least 4 letters and 60% of the
  word: "paleontology" for paleontologist, "dancing" for dance). Compound parts are allowed
  ("light" in a lighthouse's description): the owner's rule is only "not the word itself",
- has a description over **140 characters**, the 4 lines the card shows on a 375 pt phone
  ([play-screen.md](play-screen.md)),
- has fewer than 2 or more than 4 hints, a duplicate hint, or a hint that isn't one
  word of 2–12 letters a–z,
- has a hint that **contains the word or is contained in it** ("sun" for "sunflower",
  "hippo" for "hippopotamus"). Those give letters away,
- has a duplicate id.

It also prints how many words there are at each length. **Every level in
`src/game/levels.ts` needs words in its length range.** A test (`has words for
every level`) fails if a level has none. Today: 182 words of 3–15 letters, thinnest
at 13–15 letters (3–6 each). Add long words before adding harder levels.

## Migrating to PostgreSQL (later)

The table maps 1:1: `id text pk, word text, language text, description text, hints text[], sense text`. Add
a check constraint for `^[a-z]{1,15}$`, plus whatever difficulty data the owner
decides on. `pickWord`'s inputs (level, language, the player's seen ids) are what the query
has to answer; the seen list then belongs on the server too. The server must never send the word
to a guesser in two-player mode (CLAUDE.md). That applies to solo too once words come from the server.
