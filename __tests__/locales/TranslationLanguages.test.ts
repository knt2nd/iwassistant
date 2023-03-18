import { Languages, TranslationLanguages } from '../../src/app/locales';

test('every TranslationLanguage belongs to Language', () => {
  for (const tl of Object.keys(TranslationLanguages)) {
    const lang = tl === 'mni-Mtei' ? tl : (tl.split('-')[0] as Language);
    expect(Languages[lang]).toBeDefined();
  }
});
