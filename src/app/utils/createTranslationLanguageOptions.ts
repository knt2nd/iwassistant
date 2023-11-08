import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TranslationLanguages } from '../enums';
import { isLocale } from './isLocale';
import { toLanguage } from './toLanguage';

const CacheStore = new Map<string, { timer: NodeJS.Timeout | undefined; data: Record<string, string> }>();

const CacheTime = 60 * 60 * 1000;

export function createTranslationLanguageOptions(engines: Map<string, ITranslator>, locale: Locale): SelectOption[] {
  if (!isLocale(locale)) throw new Error('Invalid locale'); // just in case
  const langs = [...new Set([...engines.values()].flatMap(({ languages }) => languages)).values()].sort();
  const lang = /^zh-(TW|HK)$/.test(locale) ? 'zh-TW' : toLanguage(locale); // Taiwan and Hong Kong people prefer Traditional Chinese
  let local: Record<string, string> | undefined;
  if (lang !== 'en') {
    const cache = CacheStore.get(lang);
    if (cache) {
      if (cache.timer) {
        clearTimeout(cache.timer);
        cache.timer = setTimeout(() => CacheStore.delete(lang), CacheTime);
      }
      local = cache.data;
    } else {
      try {
        const json = readFileSync(join(__dirname, `../../../assets/json/lang/${lang}.json`), 'utf8');
        local = JSON.parse(json.toString()) as Record<string, string>;
        CacheStore.set(lang, {
          timer: setTimeout(() => CacheStore.delete(lang), CacheTime),
          data: local,
        });
      } catch {
        CacheStore.set(lang, { timer: undefined, data: {} });
      }
    }
  }
  return langs.map((lang) => ({ value: lang, label: `${lang}: ${local?.[lang] ?? TranslationLanguages[lang]}` }));
}
