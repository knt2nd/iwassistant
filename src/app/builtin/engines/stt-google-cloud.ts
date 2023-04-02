import { OpusEncoder } from '@discordjs/opus';
import { SpeechClient } from '@google-cloud/speech';
import type { google } from '@google-cloud/speech/build/protos/protos';
import { join } from 'node:path';
import { Languages, Locales } from '../../locales';
import { isRegionLocale } from '../../utils';

const DefaultVoice = 'en-US';

// https://cloud.google.com/speech-to-text/docs/languages
const AvailableLocales: (`${Language}-${string}` | [locale: Locale, id: string, label: string])[] = [
  'af-ZA',
  'am-ET',
  'ar-AE',
  'ar-BH',
  'ar-DZ',
  'ar-EG',
  'ar-IL',
  'ar-IQ',
  'ar-JO',
  'ar-KW',
  'ar-LB',
  'ar-MA',
  'ar-MR',
  'ar-OM',
  'ar-PS',
  'ar-QA',
  'ar-SA',
  'ar-TN',
  'ar-YE',
  'az-AZ',
  'bg-BG',
  'bn-BD',
  'bn-IN',
  'bs-BA',
  'ca-ES',
  'cs-CZ',
  'da-DK',
  'de-DE',
  'de-AT',
  'de-CH',
  'el-GR',
  'en-US',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-GH',
  'en-HK',
  'en-IE',
  'en-IN',
  'en-KE',
  'en-NG',
  'en-NZ',
  'en-PH',
  'en-PK',
  'en-SG',
  'en-TZ',
  'en-ZA',
  'es-ES',
  'es-AR',
  'es-BO',
  'es-CL',
  'es-CO',
  'es-CR',
  'es-DO',
  'es-EC',
  'es-GT',
  'es-HN',
  'es-MX',
  'es-NI',
  'es-PA',
  'es-PE',
  'es-PR',
  'es-PY',
  'es-SV',
  'es-US',
  'es-UY',
  'es-VE',
  'et-EE',
  'eu-ES',
  'fa-IR',
  'fi-FI',
  'fil-PH',
  'fr-FR',
  'fr-BE',
  'fr-CA',
  'fr-CH',
  'gl-ES',
  'gu-IN',
  'hi-IN',
  'hr-HR',
  'hu-HU',
  'hy-AM',
  'id-ID',
  'is-IS',
  'it-IT',
  'it-CH',
  ['he', 'iw-IL', Languages.he],
  'ja-JP',
  'jv-ID',
  'ka-GE',
  'kk-KZ',
  'km-KH',
  'kn-IN',
  'ko-KR',
  'lo-LA',
  'lt-LT',
  'lv-LV',
  'mk-MK',
  'ml-IN',
  'mn-MN',
  'mr-IN',
  'ms-MY',
  'my-MM',
  'ne-NP',
  'nl-NL',
  'nl-BE',
  'no-NO',
  'pa-Guru-IN',
  'pl-PL',
  'pt-PT',
  'pt-BR',
  'ro-RO',
  'ru-RU',
  'rw-RW',
  'si-LK',
  'sk-SK',
  'sl-SI',
  'sq-AL',
  'sr-RS',
  'ss-latn-za',
  'st-ZA',
  'su-ID',
  'sv-SE',
  'sw-KE',
  'sw-TZ',
  'ta-IN',
  'ta-LK',
  'ta-MY',
  'ta-SG',
  'te-IN',
  'th-TH',
  'tn-latn-za',
  'tr-TR',
  'ts-ZA',
  'uk-UA',
  'ur-IN',
  'ur-PK',
  'uz-UZ',
  've-ZA',
  'vi-VN',
  'xh-ZA',
  ['zh-CN', 'cmn-Hans-CN', '中文 - 中国大陆 (简体)'],
  ['zh-TW', 'cmn-Hant-TW', '中文 - 台灣 (繁體)'],
  ['zh-HK', 'yue-Hant-HK', '粵語 - 香港 (繁體)'],
  'zu-ZA',
];

function availableLocales(): VoiceLocales {
  const locales: VoiceLocales = {};
  for (const l of AvailableLocales) {
    const locale = typeof l === 'string' ? (isRegionLocale(l) ? l : (l.split('-')[0] as Language)) : l[0];
    // if (locales[locale]) throw new Error(locale);
    const [id, label] = typeof l === 'string' ? [l, Locales[locale]] : [l[1], l[2]];
    locales[locale] = { [id]: `${locale}: ${label}` };
  }
  return locales;
}

class AudioDecoder implements Record<AssistantType, (chunk: Buffer) => Buffer> {
  readonly #opus = new OpusEncoder(48_000, 1);

  guild = (chunk: Buffer): Buffer => {
    return this.#opus.decode(chunk);
  };

  // just mock for now
  home = (): Buffer => {
    return Buffer.from([]);
  };
}

export type Config = {
  /**
   * Path of service account JSON
   * @default "./secrets/google-cloud.json"
   * @see https://cloud.google.com/speech-to-text/docs/before-you-begin
   */
  secret: string;
  /**
   * Enable profanity filter
   * @default false
   * @see https://cloud.google.com/speech-to-text/docs/profanity-filter
   */
  profanityFilter: boolean;
  /**
   * Enable automatic punctuation
   * @default true
   * @see https://cloud.google.com/speech-to-text/docs/automatic-punctuation
   */
  automaticPunctuation: boolean;
  /**
   * Enable spoken punctuation
   * @default false
   * @see https://cloud.google.com/speech-to-text/docs/spoken-punctuation-emojis
   */
  spokenPunctuation: boolean;
  /**
   * Enable spoken emojis
   * @default false
   * @see https://cloud.google.com/speech-to-text/docs/spoken-punctuation-emojis
   */
  spokenEmojis: boolean;
  /**
   * Transcription model name
   * @default ""
   * @see https://cloud.google.com/speech-to-text/docs/transcription-model
   */
  model: string;
};

export const engine: IEngine<Config> = {
  name: 'stt-google-cloud',
  description: 'Google Cloud STT',
  config: {
    secret: join(__dirname, '../../../../secrets/google-cloud.json'),
    profanityFilter: false,
    automaticPunctuation: true,
    spokenPunctuation: false,
    spokenEmojis: false,
    model: '',
  },
  createSTT({ config, app }) {
    let counter = 0;
    const log = app.log.createChild('STT');
    const decoder = new AudioDecoder();
    const client = new SpeechClient({ keyFile: config.secret });
    const transcribe = (request: STTRequest): void => {
      log.debug?.(`[${++counter}] Request`);
      // speechContexts option makes more accurate? :thinking:
      // https://cloud.google.com/speech-to-text/docs/reference/rpc/google.cloud.speech.v1p1beta1
      const recognizer = client.streamingRecognize({
        interimResults: request.interim,
        singleUtterance: request.interim,
        config: {
          languageCode: request.voice || DefaultVoice,
          encoding: 'LINEAR16',
          sampleRateHertz: 48_000,
          audioChannelCount: 1,
          profanityFilter: config.profanityFilter,
          enableAutomaticPunctuation: config.automaticPunctuation,
          enableSpokenPunctuation: { value: config.spokenPunctuation },
          enableSpokenEmojis: { value: config.spokenEmojis },
          model: config.model || null,
        },
      });
      const audio = request.audio;
      const onAbort = (): void => void recognizer.destroy();
      if (log.debug) audio.once('abort', () => log.debug?.(`[${counter}] Abort`));
      audio.emit('start', request);
      audio.once('abort', onAbort);
      audio.resource.once('close', () => recognizer.end());
      audio.resource.on('data', (chunk: Buffer) => recognizer.write(decoder[audio.type](chunk)));
      recognizer.on('error', log.error);
      recognizer.once('end', () => recognizer.destroy());
      recognizer.once('close', () => {
        if (audio.aborted) return;
        if (audio.resource.closed) {
          audio.emit('end', request);
          log.debug?.(`[${counter}] Close`);
        } else {
          audio.off('abort', onAbort);
          audio.abort();
          log.debug?.(`[${counter}] Close and abort`);
        }
      });
      recognizer.on('data', (data: google.cloud.speech.v1.StreamingRecognizeResponse) => {
        let transcript = '';
        for (let i = 0; i < data.results.length; i++) {
          transcript += data.results[i]?.alternatives?.[0]?.transcript ?? '';
        }
        if (transcript.length === 0) return;
        const isFinal = !!data.results.at(-1)?.isFinal;
        audio.emit('result', transcript, isFinal);
        if (isFinal) audio.results.push(transcript);
        log.debug?.(`[${counter}] ${isFinal ? 'Final' : 'Interim'}: ${transcript}`);
      });
    };
    return {
      active: true,
      locales: availableLocales(),
      transcribe: (request) => {
        (async () => {
          if (request.audio.prepare) await request.audio.prepare();
          transcribe(request);
        })().catch(log.error);
        return true;
      },
    };
  },
};
