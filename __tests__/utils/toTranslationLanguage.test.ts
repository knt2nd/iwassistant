import { Locales, TranslationLanguages } from '../../src/app/enums';
import { toTranslationLanguage } from '../../src/app/utils';

test('toTranslationLanguage', () => {
  for (const locale of Object.keys(Locales) as Locale[]) {
    expect(Object.keys(TranslationLanguages)).toContain(toTranslationLanguage(locale));
  }
  expect(toTranslationLanguage('en')).toBe('en');
  expect(toTranslationLanguage('en-US')).toBe('en');
  expect(toTranslationLanguage('en-GB')).toBe('en');
  expect(toTranslationLanguage('ja')).toBe('ja');
  expect(toTranslationLanguage('zh')).toBe('zh-CN');
  expect(toTranslationLanguage('zh-CN')).toBe('zh-CN');
  expect(toTranslationLanguage('zh-TW')).toBe('zh-TW');
  expect(toTranslationLanguage('zh-HK')).toBe('zh-TW');
  expect(toTranslationLanguage('mni-Mtei')).toBe('mni-Mtei');
});
