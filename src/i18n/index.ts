/*
 * All UI text lives in translation files (CLAUDE.md, Languages). The MVP
 * ships English only; adding a language means adding a JSON file with the
 * same keys and registering it below.
 */
import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import de from './de.json';
import { useSyncExternalStore } from 'react';

export type TranslationKey = keyof typeof en;
type Params = Record<string, string | number>;
export type Translator = (key: TranslationKey, params?: Params) => string;

export const TRANSLATIONS: Record<string, Record<TranslationKey, string>> = { en, fr, es, de };

let current = 'en';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => current;
/** Every text-bearing component subscribes, including memoized tiles and navigation labels. */
export const useLanguage = () => useSyncExternalStore(subscribe, snapshot, snapshot);
const translate = (language: string, key: TranslationKey, params?: Params) => {
  const text = TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
};
const translators = Object.fromEntries(Object.keys(TRANSLATIONS).map(language => [language,
  Object.assign((key: TranslationKey, params?: Params) => translate(language, key, params), { language }),
]));
/** A different function per locale also makes translations safe under React Compiler memoization. */
export const useTranslation = () => translators[useLanguage()];

export function setLanguage(language: string) {
  const next = Object.hasOwn(TRANSLATIONS, language) ? language : 'en';
  if (current === next) return;
  current = next;
  listeners.forEach(listener => listener());
}

/** `t('header.level', { level: 4 })` → "Lv 4". Unknown placeholders stay as written. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(current, key, params);
}
