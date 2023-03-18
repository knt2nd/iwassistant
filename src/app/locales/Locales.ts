import { Languages } from './Languages';
import { RegionLocales } from './RegionLocales';

export const Locales = Object.fromEntries(
  [...Object.entries(Languages), ...Object.entries(RegionLocales)].sort((a, b) => a[0].localeCompare(b[0])),
) as typeof Languages & typeof RegionLocales;
