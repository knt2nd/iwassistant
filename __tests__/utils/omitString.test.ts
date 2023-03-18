import { omitString } from '../../src/app/utils';

const fixture = 'abcdeあいうえお';

describe('omitString', () => {
  test('target length is equal to max', () => {
    const result = omitString(fixture, 10);
    expect(result).toBe(fixture);
    expect(result).toHaveLength(10);
  });

  test('target length is less than max', () => {
    const result = omitString(fixture, 11);
    expect(result).toBe(fixture);
    expect(result).toHaveLength(10);
  });

  test('target length is greater than max', () => {
    const result = omitString(fixture, 9);
    expect(result).toBe('abcdeあい...');
    expect(result).toHaveLength(10);
  });
});
