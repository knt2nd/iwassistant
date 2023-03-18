import { Locales } from '../locales';

export function isLocale(target: string): target is Locale {
  return (Locales as Record<string, string>)[target] !== undefined;
}
