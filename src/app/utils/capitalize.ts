export function capitalize<T extends string>(target: T): Capitalize<T> {
  return (target.charAt(0).toUpperCase() + target.slice(1)) as Capitalize<T>;
}
