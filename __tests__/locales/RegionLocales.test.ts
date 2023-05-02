import { Languages, RegionLocales } from '../../src/app/enums';
import { toLanguage } from '../../src/app/utils';

test('every RegionLocale belongs to Language', () => {
  for (const [code, localeName] of Object.entries(RegionLocales)) {
    const langName = Languages[toLanguage(code as Locale)];
    expect(langName).toBeDefined();
    expect(localeName).toMatch(new RegExp(`^${langName} - `));
  }
});
