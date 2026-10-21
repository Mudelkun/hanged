/*
 * All UI text lives in translation files (CLAUDE.md, Languages). The MVP
 * ships English only; adding a language means adding a JSON file with the
 * same keys and registering it below.
 */
import en from './en.json';

export type TranslationKey = keyof typeof en;

const TRANSLATIONS: Record<string, Record<TranslationKey, string>> = { en };

let current = 'en';

export function setLanguage(language: string) {
  if (TRANSLATIONS[language]) current = language;
}

/** `t('header.level', { level: 4 })` → "Lv 4". Unknown placeholders stay as written. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const text = TRANSLATIONS[current][key] ?? TRANSLATIONS.en[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}
