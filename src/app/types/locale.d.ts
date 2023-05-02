type Locale = keyof typeof import('../enums').Locales;

type Language = keyof typeof import('../enums').Languages;

type RegionLocale = keyof typeof import('../enums').RegionLocales;

type TranslationLanguage = keyof typeof import('../enums').TranslationLanguages;

type I18n<T> = Partial<Record<Locale, T>>;
