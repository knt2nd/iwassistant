import { findLocale } from './findLocale';

export function localize<T>(i18n: I18n<T>, locale: Locale | Locale[], fallbackToFirst = false): T | undefined {
  const locales = Array.isArray(locale) ? locale : [locale];
  const candidates = Object.keys(i18n) as Locale[];
  if (candidates[0] === undefined) return undefined;
  let foundLocale: Locale | undefined;
  for (const locale of locales) {
    foundLocale = findLocale(candidates, locale);
    if (foundLocale) break;
  }
  return foundLocale ? i18n[foundLocale] : fallbackToFirst ? i18n[candidates[0]] : undefined;
}
