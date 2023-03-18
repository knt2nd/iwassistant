export function toKebabCase(target: string): string {
  return target.replaceAll(/([^A-Z-])([A-Z])/g, '$1-$2').toLowerCase();
}
