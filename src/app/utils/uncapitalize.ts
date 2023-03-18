export function uncapitalize<T extends string>(target: T): Uncapitalize<T> {
  return (target.charAt(0).toLowerCase() + target.slice(1)) as Uncapitalize<T>;
}
