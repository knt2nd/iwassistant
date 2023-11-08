import { isLocale } from './isLocale';

export function parseVoiceId(voiceId: string): VoiceConfig | undefined {
  const [engine, locale, ...rest] = voiceId.split(':');
  const voice = rest.join(':');
  if (!engine || !locale || !voice || !isLocale(locale)) return undefined;
  return { engine, locale, voice };
}
