import { isObject } from './isObject';

export function omitObject(target: object, keys: string[], recursive = false): object {
  if (keys.length === 0) return target;
  return Object.fromEntries(
    Object.entries(target)
      .filter(([key]) => !keys.includes(key))
      .map(([key, value]) => (recursive && isObject(value) ? [key, omitObject(value, keys)] : [key, value])),
  );
}
