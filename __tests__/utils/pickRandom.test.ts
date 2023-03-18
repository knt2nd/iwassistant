import { pickRandom } from '../../src/app/utils';

test('pickRandom', () => {
  expect(pickRandom([1, 2, 3])).toEqual(expect.any(Number));
  expect(pickRandom(['a', 'b', 'c'])).toEqual(expect.any(String));
  expect(pickRandom([])).toBeUndefined();
});
