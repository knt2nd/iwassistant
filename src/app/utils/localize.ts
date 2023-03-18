import { selectLocale } from './selectLocale';

export function localize<T>(i18n: I18n<T>, locale: Locale | Locale[], fallbackToFirst = false): T | undefined {
  const locales = Array.isArray(locale) ? locale : [locale];
  const candidates = Object.keys(i18n) as Locale[];
  if (candidates[0] === undefined) return undefined;
  let selectedLocale: Locale | undefined;
  for (const locale of locales) {
    selectedLocale = selectLocale(candidates, locale);
    if (selectedLocale) break;
  }
  return selectedLocale ? i18n[selectedLocale] : fallbackToFirst ? i18n[candidates[0]] : undefined;
}
