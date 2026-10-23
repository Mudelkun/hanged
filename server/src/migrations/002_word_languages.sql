-- The French, Spanish and German packs keep their accents (zèbre, niño, straße),
-- so each language checks its own letters, the same sets as wordId in app.ts.

ALTER TABLE words DROP CONSTRAINT words_word_check;
ALTER TABLE words ADD CONSTRAINT words_word_check CHECK (
     (language = 'en' AND word ~ '^[a-z]{1,15}$')
  OR (language = 'fr' AND word ~ '^[a-zàâçéèêëîïôùûüÿœ]{1,15}$')
  OR (language = 'es' AND word ~ '^[a-záéíóúüñ]{1,15}$')
  OR (language = 'de' AND word ~ '^[a-zäöüß]{1,15}$')
);
