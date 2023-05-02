import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { Locales } from '../../enums';

const DefaultVoice = 'en-US';

const MaxLength = 200;

const AvailableLocales: Locale[] = [
  'af',
  'ar',
  'bg',
  'bn-BD',
  'bn-IN',
  'bs',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en-US',
  'en-AU',
  'en-GB',
  'en-IN',
  'es-ES',
  'es-US',
  'et',
  'fi',
  'fil',
  'fr-FR',
  'fr-CA',
  'gu',
  'he',
  'hi',
  'hr',
  'hu',
  'id',
  'is',
  'it',
  'ja',
  'jv',
  'km',
  'kn',
  'ko',
  'la',
  'lv',
  'ml',
  'mr',
  'ms',
  'my',
  'nb',
  'ne',
  'nl-NL',
  'nl-BE',
  'no',
  'pl',
  'pt-PT',
  'pt-BR',
  'ro',
  'ru',
  'si',
  'sk',
  'sq',
  'sr',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'ur',
  'vi',
  'zh-CN',
  'zh-TW',
];

export type Config = {
  /**
   * Hostname
   * @default "translate.google.com"
   */
  host: string;
};

export const engine: IEngine<Config> = {
  name: 'tts-google-translate',
  description: 'Google Translate TTS',
  config: {
    host: 'translate.google.com',
  },
  createTTS({ config }) {
    const baseURL = `https://${config.host}/translate_tts?ie=UTF-8&client=tw-ob&prev=input&total=1&idx=0`;
    return {
      active: true,
      locales: Object.fromEntries(AvailableLocales.map((l) => [l, { [l]: `${l}: ${Locales[l]}` }])),
      async generate({ voice, speed, pitch, text }) {
        if (!voice) voice = DefaultVoice;
        speed = speed < 10 ? 0.24 : 1;
        pitch = -1;
        if (text.length > MaxLength) text = text.slice(0, Math.max(0, MaxLength));
        const url = new URL(baseURL);
        url.searchParams.set('tl', voice);
        url.searchParams.set('ttsspeed', speed.toString());
        url.searchParams.set('textlen', text.length.toString());
        url.searchParams.set('q', text);
        const res = await fetch(url);
        if (!res.ok || !res.body) {
          throw new Error(`Google Translate TTS: ${res.status} ${res.statusText} ${url.toString()}`);
        }
        return { voice, speed, pitch, text, resource: Readable.fromWeb(res.body as ReadableStream) };
      },
    };
  },
};
