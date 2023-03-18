import { rand } from '../../src/app/utils';

test('rand', () => {
  for (let min = 0; min < 10; min++) {
    for (let max = 10; max < 110; max += 10) {
      for (let i = 0; i < 100; i++) {
        const num = rand(min, max);
        expect(num).toBeGreaterThanOrEqual(min);
        expect(num).toBeLessThanOrEqual(max);
      }
    }
  }
});
