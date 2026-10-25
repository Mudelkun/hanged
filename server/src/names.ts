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

/** `taken` never comes from checkName: only the server knows (GET /v1/names/available). */
export type NameProblem = 'short' | 'long' | 'characters' | 'blocked' | 'taken';
export type NameCheck = { ok: true; name: string } | { ok: false; problem: NameProblem };

export interface NameRules {
  /** The account may take a reserved name (roles.ts `reservedNames`: only the server grants it). */
  reserved?: boolean;
}

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
  // Common French, Spanish and German abuse. Use the same matcher/transformers on device and server.
  // Whole-word boundaries protect ordinary names such as Constance, Amaia and Scheider.
  // Written as the matcher reads them: double letters as one, no accents, ß as ss.
  '|putain|', '|pute[s]|', '|salope[s]|', '|salopard[s]|', '|conard[s]|', '|conasse[s]|', '|con|',
  '|merde|', '|encule[s]|', '|pd|', '|tapete[s]|', '|negre[s]|', '|nique|',
  '|puta[s]|', '|puto[s]|', '|mierda|', '|joder|', '|cabron[es]|', '|gilipollas|', '|maricon[es]|',
  '|cono|', '|pendejo[s]|', '|pendeja[s]|', '|chingar|', '|chingada|', '|culero[s]|',
  '|scheisse|', '|arschloch|', '|arsch|', '|fick[en]|', '|fotze[n]|',
  '|hurensohn|', '|wichser|', '|schlampe[n]|', '|schwuchtel|', '|neger|',
  '|moderateur|', '|administrateur|', '|administrador|', '|entwickler|',
];
/** Real names its list blocks. */
const ALLOWED_NAMES = ['analise'];
/** The English list excuses "fick", which is German abuse: excuse only "fickle". */
const UNEXCEPTED = new Set(['fick']);
const EXCEPTED_WORDS = ['fickle'];

const words = new DataSet<unknown>().addAll(englishDataset);
for (const word of EXTRA_WORDS) words.addPhrase((phrase) => phrase.addPattern(parseRawPattern(word)));
const built = words.build();
const matcher = new RegExpMatcher({
  ...built,
  whitelistedTerms: [...(built.whitelistedTerms ?? []).filter((term) => !UNEXCEPTED.has(term)), ...EXCEPTED_WORDS, ...ALLOWED_NAMES],
  ...englishRecommendedTransformers,
});

/** Accents off, so "Héil" reads as heil, and ß as ss (the matcher skips it); other alphabets stay as they are. */
const plain = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss');

export function isBlocked(name: string): boolean {
  const text = plain(name);
  return (
    // "BigDick" as "Big Dick", so a word that only counts whole is still seen.
    matcher.hasMatch(text.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')) ||
    // Spelled out with spaces or dots ("f.u.c.k", "a s s"): the letters together.
    matcher.hasMatch(text.replace(/[\s_.'’-]+/g, ''))
  );
}

/**
 * What makes two names the same name (they're unique: owner's call, 2026-10-23).
 * Case, accents, spaces and - _ . ' don't count, so "Zoë" is "zoe" and "Ro-da" is "Roda".
 */
export const nameKey = (name: string) => plain(name).toLowerCase().replace(/[\s_.'’-]+/g, '');

/**
 * Names only a staff account may take (roles.ts `reservedNames`), however
 * they're spelled (nameKey): "ADMIN" and "a.d.m.i.n" are "Admin". The filter
 * blocks them for everyone else (EXTRA_WORDS), and names are unique, so one
 * account holds each.
 */
export const RESERVED_NAMES = ['Admin'] as const;
const RESERVED_KEYS = new Set<string>(RESERVED_NAMES.map(nameKey));
export const isReservedName = (name: string) => RESERVED_KEYS.has(nameKey(name));

/** "Roda2", "Roda3"… for numbers from..to, the name cut so each fits NAME_MAX: what a taken name falls back to. */
export function nameVariants(name: string, from: number, to: number): string[] {
  const letters = [...name];
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const n = String(from + i);
    return letters.slice(0, NAME_MAX - n.length).join('').trimEnd() + n;
  });
}

/** The name as it will be saved, or why it can't be. */
export function checkName(raw: string | null, rules: NameRules = {}): NameCheck {
  const name = cleanName(raw);
  const length = name ? [...name].length : 0;
  if (!name || length < NAME_MIN) return { ok: false, problem: 'short' };
  if (length > NAME_MAX) return { ok: false, problem: 'long' };
  if (!ALLOWED.test(name) || !A_LETTER.test(name)) return { ok: false, problem: 'characters' };
  if (isBlocked(name) && !(rules.reserved && isReservedName(name))) return { ok: false, problem: 'blocked' };
  return { ok: true, name };
}
