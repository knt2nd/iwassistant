import { isLocale } from '../../src/app/utils';

test('isLocale', () => {
  expect(isLocale('en')).toBe(true);
  expect(isLocale('ja')).toBe(true);
  expect(isLocale('zh')).toBe(true);
  expect(isLocale('zh-CN')).toBe(true);
  expect(isLocale('zh-TW')).toBe(true);
  expect(isLocale('__')).toBe(false);
  expect(isLocale('')).toBe(false);
  expect(isLocale(1 as unknown as string)).toBe(false);
  expect(isLocale(true as unknown as string)).toBe(false);
  expect(isLocale([] as unknown as string)).toBe(false);
  expect(isLocale({} as unknown as string)).toBe(false);
  expect(isLocale(null as unknown as string)).toBe(false);
  expect(isLocale(undefined as unknown as string)).toBe(false);
});
