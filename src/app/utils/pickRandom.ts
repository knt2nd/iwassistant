export function pickRandom<T>(candidates: T[]): T | undefined {
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
