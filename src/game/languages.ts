/** Supported offline languages. Names stay in their own language so the picker is recognizable. */
export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'es', name: 'Español' },
  { id: 'de', name: 'Deutsch' },
] as const;
export type Language = (typeof LANGUAGES)[number]['id'];
export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(l => l.id === value);

/** First supported preference, including regional tags (fr-CA, es-MX). */
export function languageForLocales(locales: readonly string[]): Language {
  for (const locale of locales) {
    const code = locale.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) return code;
  }
  return 'en';
}

export const KEYBOARD_ROWS: Record<Language, readonly string[]> = {
  en: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  fr: ['azertyuiop', 'qsdfghjklm', 'wxcvbnœ'],
  es: ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'],
  de: ['qwertzuiop', 'asdfghjkl', 'yxcvbnmß'],
};
export const alphabetFor = (language: string) => KEYBOARD_ROWS[isLanguage(language) ? language : 'en'].join('').split('');

const WORD_PATTERNS: Record<Language, RegExp> = {
  en: /^[a-z]+$/,
  fr: /^[a-zàâçéèêëîïôùûüÿœ]+$/,
  es: /^[a-záéíóúüñ]+$/,
  de: /^[a-zäöüß]+$/,
};
export const hasValidLetters = (word: string, language: string) =>
  WORD_PATTERNS[isLanguage(language) ? language : 'en'].test(word);

/** One display letter maps to one key. Ñ and ß remain distinct; no spelling is lost. */
export function guessLetter(letter: string, language: string): string {
  const lower = letter.normalize('NFC').toLowerCase();
  if (language === 'en' || (language === 'es' && lower === 'ñ')) return lower;
  return lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
export const guessWord = (word: string, language: string) => [...word].map(c => guessLetter(c, language)).join('');
/** Keep ß recognizable instead of expanding it to two S letters in one tile. */
export const displayLetter = (letter: string) => letter === 'ß' ? 'ß' : letter.toUpperCase();
