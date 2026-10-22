/*
 * Player names: what a name may contain and the filter for names that don't
 * belong on a public leaderboard (App Store Guideline 1.2). Shared like
 * contract.ts: the app checks a name before saving it (src/game/progress.ts),
 * and the server checks it again on every sync, because a modified app could
 * skip the first check. So its only import is `obscenity`, which both
 * package.json files list.
 *
 * The filter errs on the side of blocking. A blocked player just picks
 * another name; a slur on the leaderboard is far worse than a false positive.
 */
import { DataSet, englishDataset, englishRecommendedTransformers, parseRawPattern, RegExpMatcher } from 'obscenity';

export const NAME_MIN = 2;
/** Owner's call (2026-10-22): 15, for long real names. The Play header shrinks a long one to fit. */
export const NAME_MAX = 15;
/**
 * What the server's schema lets through, looser than NAME_MAX on purpose: a
 * phone with an older, longer name must still sync its rounds. checkName then
 * drops that name (stored as null).
 */
export const NAME_SENT_MAX = 64;

export type NameProblem = 'short' | 'long' | 'characters' | 'blocked';
export type NameCheck = { ok: true; name: string } | { ok: false; problem: NameProblem };

/** Trimmed, single-spaced, no control or invisible characters; empty → null. */
export function cleanName(name: string | null): string | null {
  const clean = name?.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  return clean || null;
}

/** Letters (any language), digits, spaces and - _ . ' (iOS types ’) — and at least one letter. */
const ALLOWED = /^[\p{L}\p{M}\p{N} _.'’-]+$/u;
const A_LETTER = /\p{L}/u;

/**
 * The offensive words come from obscenity's English list (leetspeak, repeated
 * letters and look-alikes included, each word with its own harmless
 * exceptions: Scunthorpe, Cassandra, Dickens). These are what it leaves out,
 * in its pattern syntax: `|` marks the edge of a word, so "|nazi|" blocks
 * Nazi but not Nazir. It reads a double letter as one (except b e o l s g),
 * so "official" is written "oficial", and "kkk" can't be told from a "K".
 */
const EXTRA_WORDS = [
  'hitler', '|heil|', '|nazi[s]|', '|kys|', '|spic[s]|', 'wetback', '|horny|', '|nude[s]|', '|naked|',
  '|milf|', '|thot[s]|', '|hoe[s]|', '|pedo|', 'p[a]edophile', 'paedo', 'molest', '|clit|', '|scum|',
  // Names that pretend to speak for the game.
  'admin', 'moderator', 'oficial', '|hanged|', '|suport|', '|staf|', '|system|', '|mod[s]|', '|developer|',
];
/** Real names its list blocks. */
const ALLOWED_NAMES = ['analise'];

const words = new DataSet<unknown>().addAll(englishDataset);
for (const word of EXTRA_WORDS) words.addPhrase((phrase) => phrase.addPattern(parseRawPattern(word)));
const built = words.build();
const matcher = new RegExpMatcher({
  ...built,
  whitelistedTerms: [...(built.whitelistedTerms ?? []), ...ALLOWED_NAMES],
  ...englishRecommendedTransformers,
});

/** Accents off, so "Héil" reads as heil; other alphabets stay as they are. */
const plain = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '');

export function isBlocked(name: string): boolean {
  const text = plain(name);
  return (
    // "BigDick" as "Big Dick", so a word that only counts whole is still seen.
    matcher.hasMatch(text.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')) ||
    // Spelled out with spaces or dots ("f.u.c.k", "a s s"): the letters together.
    matcher.hasMatch(text.replace(/[\s_.'’-]+/g, ''))
  );
}

/** The name as it will be saved, or why it can't be. */
export function checkName(raw: string | null): NameCheck {
  const name = cleanName(raw);
  const length = name ? [...name].length : 0;
  if (!name || length < NAME_MIN) return { ok: false, problem: 'short' };
  if (length > NAME_MAX) return { ok: false, problem: 'long' };
  if (!ALLOWED.test(name) || !A_LETTER.test(name)) return { ok: false, problem: 'characters' };
  if (isBlocked(name)) return { ok: false, problem: 'blocked' };
  return { ok: true, name };
}
