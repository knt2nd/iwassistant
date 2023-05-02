import { Locales } from '../enums';

const RegionLocaleToLanguage = Object.fromEntries(
  Object.keys(Locales).map((locale) => [locale, locale === 'mni-Mtei' ? 'mni-Mtei' : locale.split('-')[0]]),
) as Record<Locale, Language>;

export function toLanguage(locale: Locale): Language {
  return RegionLocaleToLanguage[locale];
}
