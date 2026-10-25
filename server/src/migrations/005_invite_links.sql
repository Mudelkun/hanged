-- Friend invite links (https://<server>/i/<code>): one code per player, made the
-- first time they share their link. Following it makes the two friends at once.
ALTER TABLE players ADD COLUMN invite_code text UNIQUE;
