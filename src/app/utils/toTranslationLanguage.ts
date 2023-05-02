import { Locales } from '../enums';

const LocaleToTranslationLanguage = Object.fromEntries(
  Object.keys(Locales).map((locale) => {
    const [lang] = locale.split('-') as [string];
    return [
      locale,
      lang === 'zh'
        ? ['zh-TW', 'zh-HK'].includes(locale)
          ? 'zh-TW'
          : 'zh-CN'
        : locale === 'mni-Mtei'
        ? 'mni-Mtei'
        : lang,
    ];
  }),
) as Record<Locale, TranslationLanguage>;

export function toTranslationLanguage(locale: Locale): TranslationLanguage {
  return LocaleToTranslationLanguage[locale];
}
