import { Languages, RegionLocales } from '../enums';

const LanguageToRegionLocales = Object.fromEntries(
  Object.keys(Languages).map((lang) => [lang, Object.keys(RegionLocales).filter((rl) => rl.startsWith(lang))]),
) as Record<Language, RegionLocale[]>;

export function toRegionLocales(lang: Language): RegionLocale[] {
  return LanguageToRegionLocales[lang];
}
