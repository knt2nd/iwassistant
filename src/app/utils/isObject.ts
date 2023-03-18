export function isObject(target: unknown): target is object {
  if (target === undefined || target === null) return false;
  return target.constructor === Object;
}
