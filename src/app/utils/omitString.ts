export function omitString(target: string, max: number): string {
  return target.length > max ? `${target.slice(0, Math.max(0, max - 2))}...` : target;
}
