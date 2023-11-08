export function createVoiceIdOptions(engines: Map<string, { locales: VoiceLocales }>): SelectOption[] {
  const multi = engines.size > 1;
  const selectOptions: SelectOption[] = [];
  for (const [name, { locales }] of engines) {
    for (const [locale, voices] of Object.entries(locales)) {
      for (const [voice, label] of Object.entries(voices)) {
        selectOptions.push({ value: `${name}:${locale}:${voice}`, label: multi ? `${label} (${name})` : label });
      }
    }
  }
  selectOptions.sort((a, b) => a.label.localeCompare(b.label));
  return selectOptions;
}
