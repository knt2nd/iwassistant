import { TranslationLanguages } from '../enums';

export function isTranslationLanguage(target: string): target is TranslationLanguage {
  return (TranslationLanguages as Record<string, string>)[target] !== undefined;
}
