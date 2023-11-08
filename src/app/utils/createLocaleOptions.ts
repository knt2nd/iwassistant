import { Locales } from '../enums';

export function createLocaleOptions(): SelectOption[] {
  return Object.entries(Locales).map(([locale, name]) => ({ value: locale, label: `${locale}: ${name}` }));
}
