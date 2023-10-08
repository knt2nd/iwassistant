import textToSpeech from '@google-cloud/text-to-speech';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Locales } from '../../enums';
import { isLocale } from '../../utils';

const DefaultVoice = 'en-US-Neural2-A';

const VoiceTypeOrder = ['Standard', 'Wavenet', 'Neural2'];

const LocaleMap: Record<string, Locale> = {
  'cmn-CN': 'zh-CN',
  'cmn-TW': 'zh-TW',
  'yue-HK': 'zh-HK',
};

export type Config = {
  /**
   * Path of service account JSON
   * @default "./secrets/google-cloud.json"
   * @see https://cloud.google.com/text-to-speech/docs/before-you-begin
   */
  secret: string;
};

export const engine: IEngine<Config> = {
  name: 'tts-google-cloud',
  description: 'Google Cloud TTS',
  config: {
    secret: join(__dirname, '../../../../secrets/google-cloud.json'),
  },
  async createTTS({ config, app }) {
    const client = new textToSpeech.TextToSpeechClient({ keyFile: config.secret });
    const [listResponse] = await client.listVoices();
    const listedVoices = listResponse.voices!;
    const voices = [...new Set(listedVoices.map((voice) => voice.name!))]
      .sort()
      .sort((a, b) => {
        const [aMain, aSub] = a.toLocaleLowerCase().split('-');
        const [bMain, bSub] = b.toLocaleLowerCase().split('-');
        if (aMain === bMain && aSub === bSub) return 0;
        const aOrder = aMain === aSub ? -1 : 1;
        const bOrder = bMain === bSub ? 1 : -1;
        return aOrder + bOrder;
      })
      .sort((a, b) => {
        const aOrder = a.startsWith('en-US') ? -1 : 1;
        const bOrder = b.startsWith('en-US') ? 1 : -1;
        return aOrder + bOrder;
      })
      .sort((a, b) => {
        const aType = a.split('-')[2];
        const bType = b.split('-')[2];
        if (!aType || !bType || aType === bType) return 0;
        return VoiceTypeOrder.indexOf(bType) - VoiceTypeOrder.indexOf(aType);
      });
    const locales: VoiceLocales = {};
    for (const voice of voices) {
      const [main, sub] = voice.split('-');
      if (!main || !sub) continue;
      const code = `${main}-${sub}`;
      const locale = LocaleMap[code] ?? (isLocale(code) ? code : isLocale(main) ? main : undefined);
      if (!locale) {
        app.log.warn(`Google Cloud TTS: Undefined voice (${voice})`);
        continue;
      }
      const voices = locales[locale] ?? {};
      const prefix = LocaleMap[code];
      voices[voice] = `${prefix ? `${prefix}: ` : ''}${voice}: ${Locales[locale]}`;
      locales[locale] = voices;
    }
    return {
      active: true,
      locales,
      async generate({ voice, speed, pitch, text }) {
        if (!voice) voice = DefaultVoice;
        if (speed < 0 || speed > 20) speed = 10;
        if (pitch < 0 || pitch > 20) pitch = 10;
        // https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize#AudioConfig
        // speed: 0.25 ~ 4.0
        // pitch: -20.0 ~ 20.0
        // speed = speed < 10 ? (speed / 10) * 0.75 + 0.25 : ((speed - 10) / 10) * 3 + 1;
        // pitch = (pitch / 20) * 40 - 20;
        speed = speed < 10 ? (speed / 10) * 0.5 + 0.5 : ((speed - 10) / 10) * 1.5 + 1;
        pitch = (pitch / 20) * 30 - 15;
        const [response] = await client.synthesizeSpeech({
          input: { text: text },
          voice: { name: voice, languageCode: voice.split('-').slice(0, 2).join('-') },
          audioConfig: { pitch, speakingRate: speed, audioEncoding: 'OGG_OPUS' },
        });
        if (!response.audioContent) throw new Error('Google Cloud TTS: No audio content');
        const resource = new Readable({ read: () => {} });
        resource.push(response.audioContent);
        resource.push(null);
        return { voice, speed, pitch, text, resource };
      },
    };
  },
};
