const DefaultMin = 1;

const DefaultMax = 20;

const DefaultStep = 1;

const DefaultFormat = (i: number): string => i.toString();

export function createRangeOptions(options?: {
  min?: number;
  max?: number;
  step?: number;
  format?: (i: number) => string;
}): SelectOption<number>[] {
  const min = options?.min ?? DefaultMin;
  const max = options?.max ?? DefaultMax;
  const step = options?.step ?? DefaultStep;
  const format = options?.format ?? DefaultFormat;
  const selectOptions: SelectOption<number>[] = [];
  for (let i = min; i <= max; i += step) {
    selectOptions.push({ value: i, label: format(i) });
  }
  return selectOptions;
}
