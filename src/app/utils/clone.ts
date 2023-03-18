export function clone<T extends BasicObject>(original: T): T {
  return JSON.parse(JSON.stringify(original)) as T;
}
