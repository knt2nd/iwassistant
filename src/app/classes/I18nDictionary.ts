import { pickRandom, toLanguage } from '../utils';

function fallback(locale: Locale, data: I18nDictionary['data']): Locale | null {
  if (data[locale]) return locale;
  if (locale === 'zh-HK' && data['zh-TW']) return 'zh-TW'; // Hong Kong people prefer Traditional Chinese
  const lang = toLanguage(locale);
  if (data[lang]) return lang;
  const locales = Object.keys(data) as Locale[];
  const regionLocale = locales.find((l) => l.startsWith(lang));
  if (regionLocale !== undefined) return regionLocale;
  if (locales[0] !== undefined) return locales[0];
  return null;
}

export class I18nDictionary {
  readonly locale: Locale;
  readonly data: I18n<Record<string, string | string[]>>;

  constructor(locale: Locale, data: I18nDictionary['data']) {
    this.locale = fallback(locale, data) ?? locale;
    this.data = data;
  }

  get locales(): Locale[] {
    return Object.keys(this.data) as Locale[];
  }

  sub(locale: Locale): I18nDictionary {
    return new I18nDictionary(fallback(locale, this.data) ?? this.locale, this.data);
  }

  get(key: string, params?: Record<string, Stringable>): string {
    let value = this.data[this.locale]?.[key];
    if (Array.isArray(value)) value = pickRandom(value);
    if (value === undefined) return '';
    return params ? value.replaceAll(/\${(.+?)}/g, (_, p: string) => params[p]?.toString() ?? '') : value;
  }
}
