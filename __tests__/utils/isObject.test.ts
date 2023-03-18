import { isObject } from '../../src/app/utils';

test('isObject', () => {
  expect(isObject({})).toBe(true);
  expect(isObject(null)).toBe(false);
  expect(isObject(undefined)).toBe(false);
  expect(isObject('')).toBe(false);
  expect(isObject(1)).toBe(false);
  expect(isObject(true)).toBe(false);
  expect(isObject([])).toBe(false);
  expect(isObject(new (class A {})())).toBe(false);
});
