import { formatDate } from '../../src/app/utils';

test('formatDate', () => {
  expect(formatDate()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(formatDate(new Date('2022-01-01T00:00:00'))).toBe('2022-01-01 00:00:00');
  expect(formatDate(new Date('2022-09-09T09:09:09'))).toBe('2022-09-09 09:09:09');
  expect(formatDate(new Date('2022-10-10T10:10:10'))).toBe('2022-10-10 10:10:10');
  expect(formatDate(new Date('2022-12-31T23:59:59'))).toBe('2022-12-31 23:59:59');
  expect(formatDate(new Date('0000-00-00T00:00:00'))).toBe('NaN-NaN-NaN NaN:NaN:NaN');
  expect(formatDate(new Date('9999-99-99T99:99:99'))).toBe('NaN-NaN-NaN NaN:NaN:NaN');
});
