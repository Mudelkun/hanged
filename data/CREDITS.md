# Word database: credits

Every word description in `words.json` is based on a definition from
**Open English WordNet 2025** (https://en-word.net,
https://github.com/globalwordnet/english-wordnet), © the Open English WordNet
contributors, based on Princeton WordNet 3.0 (© Princeton University).

Licence: Creative Commons Attribution 4.0 International (CC BY 4.0),
https://creativecommons.org/licenses/by/4.0/

Changes made: each definition is reworded in plain, shorter English for the
game's clue card (`scripts/descriptions.txt`), so it never contains the answer
word. Each entry's `sense` field names the WordNet synset its description is
based on. For some words (listed in `scripts/words-review.txt`) the
description uses a more common meaning than that synset. Words without a
rewrite keep the definition with only these changes: the first letter is
capitalised and a full stop added; a leading subject label such as
"(astronomy)" is removed; clauses that contain the answer word, and trailing
clauses that don't fit the card, are dropped.

The choice of words and how common each one is (`rarity`) come from
**SCOWL** (Spell Checker Oriented Word Lists, http://wordlist.aspell.net),
release 2020.12.07:

> Copyright 2000-2018 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute and sell these word lists, the
> associated scripts, the output created from the scripts, and its
> documentation for any purpose is hereby granted without fee, provided that
> the above copyright notice appears in all copies and that both that
> copyright notice and this permission notice appear in supporting
> documentation. Kevin Atkinson makes no representations about the suitability
> of this array for any purpose. It is provided "as is" without express or
> implied warranty.

Which meaning of a word is used comes from the sense frequencies of
**Princeton WordNet 3.0**: WordNet 3.0 Copyright 2006 by Princeton University.
All rights reserved. (Princeton WordNet licence:
https://wordnet.princeton.edu/license-and-commercial-use)

The app shows these credits to players: Profile → Info & legal → Credits (`credits.*` in
`src/i18n/en.json`). Change them there too when this file changes.
