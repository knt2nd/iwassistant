import { Languages } from '../locales';

export function isLanguage(target: string): target is Language {
  return (Languages as Record<string, string>)[target] !== undefined;
}
