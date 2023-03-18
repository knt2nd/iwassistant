import { toKebabCase } from '../../src/app/utils';

test('toKebabCase', () => {
  expect(toKebabCase('AaBbCc')).toBe('aa-bb-cc');
  expect(toKebabCase('ABb1Cc')).toBe('abb1-cc');
  expect(toKebabCase('aaB1b1Cc')).toBe('aa-b1b1-cc');
  expect(toKebabCase('Aa-Bb-1Cc')).toBe('aa-bb-1-cc');
  expect(toKebabCase('aa-bb-1cc')).toBe('aa-bb-1cc');
  expect(toKebabCase('11Aa2233')).toBe('11-aa2233');
  expect(toKebabCase('Aa-ああCc')).toBe('aa-ああ-cc');
});
