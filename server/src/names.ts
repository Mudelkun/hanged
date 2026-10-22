/*
 * Player names: what a name may contain and the filter for names that don't
 * belong on a public leaderboard (App Store Guideline 1.2). Shared like
 * contract.ts: the app checks a name before saving it (src/game/progress.ts),
 * and the server checks it again on every sync, because a modified app could
 * skip the first check. So: plain code, no imports.
 *
 * The filter errs on the side of blocking. A blocked player just picks
 * another name; a slur on the leaderboard is far worse than a false positive.
 */

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

// Look-alikes people use to slip a word past a filter (sh1t, $lut, f4g).
const LEET: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i' };

/**
 * Blocked wherever they appear, even inside another word or spelled out
 * ("xXcuntXx", "f.u.c.k"). Only words that are almost never part of a
 * harmless name: "shit" is not here because of Yoshito, "nazi" because of Nazir.
 */
const BLOCKED_ANYWHERE = [
  'fuck', 'cunt', 'bitch', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'asshole', 'dickhead',
  'dumbass', 'jackass', 'bullshit', 'shithead', 'pussy', 'penis', 'vagina', 'porn', 'rapist', 'hitler', 'kkk',
  'twat', 'bollock', 'jizz', 'dildo', 'blowjob', 'handjob', 'cumshot', 'pedophile', 'paedo', 'molest', 'bastard',
  'motherf', 'wetback',
  // Names that pretend to speak for the game.
  'admin', 'moderator', 'official',
];

/**
 * Blocked only as a whole word of the name ("Big Dick", "BigDick"), because
 * they hide inside harmless ones: Titan, grape, Sussex, torpedo, Hancock, Swanky.
 */
const BLOCKED_WORDS = [
  'ass', 'arse', 'cock', 'dick', 'tit', 'tits', 'boob', 'boobs', 'sex', 'sexy', 'rape', 'pedo', 'anal', 'anus',
  'cum', 'horny', 'nude', 'nudes', 'naked', 'fag', 'fags', 'spic', 'chink', 'kike', 'tranny', 'nazi', 'nazis',
  'heil', 'kys', 'piss', 'shit', 'shitty', 'wank', 'wanker', 'clit', 'hoe', 'hoes', 'thot', 'milf', 'scum',
  'hanged', 'support', 'staff', 'system', 'mod', 'mods', 'developer',
];

/** "fuck" → /f+u+c+k+/: "fuuuuck" is still the word, "Nigeria" isn't "nigger". */
const stretchy = (words: string[]) => words.map((w) => w.replace(/./g, '$&+')).join('|');
const ANYWHERE = new RegExp(stretchy(BLOCKED_ANYWHERE));
const WHOLE = new RegExp(`^(?:${stretchy(BLOCKED_WORDS)})$`);

/** Lower case a–z only: accents off, look-alikes swapped back, everything else dropped. */
const letters = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[0-9@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');

/** The name's words: split at spaces, punctuation and lower→upper case ("BigDick" → big, dick). */
const wordsOf = (name: string) =>
  name
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[\s_.'’-]+/)
    .map(letters);

export function isBlocked(name: string): boolean {
  const all = letters(name);
  // Spelled out letter by letter ("a s s"), the whole name is the word.
  return ANYWHERE.test(all) || WHOLE.test(all) || wordsOf(name).some((w) => WHOLE.test(w));
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
