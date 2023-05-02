import { Locales } from '../enums';

export function isLocale(target: string): target is Locale {
  return (Locales as Record<string, string>)[target] !== undefined;
}
