import { clone } from '../../src/app/utils';

const primitives = {
  a: 'a',
  b: 1,
  c: true,
  e: [1, 2],
  f: [
    { f11: 'f11a', f12: true },
    { f11: 'f11b', f12: false },
  ],
  g: { g11: { g21: 'g21', g22: 1 } },
};

describe('clone', () => {
  test('regular use', () => {
    const cloned = clone(primitives);
    expect(cloned).toStrictEqual(primitives);
  });

  test('null and undefined', () => {
    const cloned = clone({ ...primitives, y: null, z: undefined } as unknown as BasicObject);
    expect(cloned).toStrictEqual({ ...primitives, y: null });
  });

  test('user class', () => {
    const cloned = clone({ ...primitives, z: new (class A {})() } as unknown as BasicObject);
    expect(cloned).toStrictEqual({ ...primitives, z: {} });
  });

  test('user class which has `toJSON()`', () => {
    const cloned = clone({
      ...primitives,
      z: new (class A {
        toJSON = (): string => 'a';
      })(),
    } as unknown as BasicObject);
    expect(cloned).toStrictEqual({ ...primitives, z: 'a' });
  });
});
