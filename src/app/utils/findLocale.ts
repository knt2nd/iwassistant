import { toLanguage } from './toLanguage';

export function findLocale(candidates: Locale[], query: Locale): Locale | undefined {
  const lang = toLanguage(query);
  const locales = candidates.filter((locale) => toLanguage(locale) === lang);
  return locales.find((locale) => locale === query) ?? locales.find((locale) => locale === lang) ?? locales[0];
}
