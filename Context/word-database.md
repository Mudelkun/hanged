# Word database

For now the database is a JSON file bundled with the app. It will move to PostgreSQL.

- Data: [data/words.json](../data/words.json) (generated, don't hand-edit).
- Source: [scripts/words-source.txt](../scripts/words-source.txt), one `word | description` per line.
- Checker/builder: [scripts/check-words.js](../scripts/check-words.js).
- Access: [src/game/words.ts](../src/game/words.ts), the **only** module that reads the
  file, so the PostgreSQL move touches one place.

## Shape

```json
{ "id": "en-castle", "word": "castle", "language": "en", "description": "A big stone home for a king." }
```

- `id` = `<language>-<word>`, stable. `recentWordIds` in the saved game refers to it,
  so keep the ids when migrating.
- `word` is lowercase a–z. Length isn't stored: it's computed (CLAUDE.md).
- `language` is on **every** word from day one, even though the MVP is English only.
- `description` is the hint the player can unlock for a token. It's required.

## Adding or changing words

1. Edit `scripts/words-source.txt`.
2. Run `npm run check:words -- --build`. This regenerates `data/words.json` and validates it.

The check fails on any word that:

- isn't 1–15 lowercase a–z,
- has fewer than **2 distinct letters**, so no clue would fit (see [game-engine.md](game-engine.md)),
- has a missing description, or **a description that contains the word itself**,
- has a duplicate id.

It also prints how many words there are at each length. **Every level in
`src/game/levels.ts` needs words in its length range.** A test (`has words for
every level`) fails if a level has none. Today: 190 words of 3–15 letters, thinnest
at 13–15 letters (4–6 each). Add long words before adding harder levels.

## Migrating to PostgreSQL (later)

The table maps 1:1: `id text pk, word text, language text, description text`. Add
a check constraint for `^[a-z]{1,15}$`, plus whatever difficulty data the owner
decides on. `pickWord`'s signature (level, language, recent ids) is what the query
has to answer. The server must never send the word to a guesser in two-player mode
(CLAUDE.md). That applies to solo too once words come from the server.
