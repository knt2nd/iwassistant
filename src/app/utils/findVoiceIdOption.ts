export function findVoiceIdOption(
  candidates: SelectOption[],
  query: Omit<VoiceConfig, 'locale'>,
): SelectOption | undefined {
  return candidates.find(({ value }) => value.startsWith(`${query.engine}:`) && value.endsWith(`:${query.voice}`));
}
