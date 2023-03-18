export function shortenId(target: string, length = 4): string {
  return target.slice(Math.max(0, target.length - length));
}
