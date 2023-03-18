import { RegionLocales } from '../locales';

export function isRegionLocale(target: string): target is RegionLocale {
  return (RegionLocales as Record<string, string>)[target] !== undefined;
}
