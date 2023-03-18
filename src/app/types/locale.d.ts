type Locale = keyof typeof import('../locales').Locales;

type Language = keyof typeof import('../locales').Languages;

type RegionLocale = keyof typeof import('../locales').RegionLocales;

type TranslationLanguage = keyof typeof import('../locales').TranslationLanguages;

type I18n<T> = Partial<Record<Locale, T>>;
