import { TranslationServiceClient } from '@google-cloud/translate';
import { join } from 'node:path';
import { TranslationLanguages } from '../../enums';

const UnavailableLanguages = new Set(['fil', 'nb', 'tn', 'ss', 've']);

const AvailableLanguages = Object.keys(TranslationLanguages).filter(
  (lang) => !UnavailableLanguages.has(lang),
) as TranslationLanguage[];

export type Config = {
  /**
   * Path of service account JSON
   * @default "./secrets/google-cloud.json"
   * @see https://cloud.google.com/translate/docs/setup
   */
  secret: string;
  /**
   * Location to request
   * @default "global"
   * @see https://cloud.google.com/translate/docs/reference/rest/v3/projects/translateText#path-parameters
   */
  location: string;
};

export const engine: IEngine<Config> = {
  name: 'translator-google-cloud',
  description: 'Google Cloud Translation',
  config: {
    secret: join(__dirname, '../../../../secrets/google-cloud.json'),
    location: 'global',
  },
  async createTranslator({ config }) {
    const client = new TranslationServiceClient({ keyFile: config.secret });
    const parent = `projects/${await client.getProjectId()}/locations/${config.location}`;
    return {
      active: true,
      languages: AvailableLanguages,
      async translate({ text, to, from }) {
        const [{ translations }] = await client.translateText({
          parent,
          mimeType: 'text/plain',
          contents: [text],
          sourceLanguageCode: from ?? null,
          targetLanguageCode: to,
        });
        if (!translations?.[0]) throw new Error('Google Cloud Translation: No response');
        const res = translations[0];
        // if (!from) {
        //   if (!res.detectedLanguageCode || !isTranslationLanguage(res.detectedLanguageCode)) {
        //     throw new Error('Google Cloud Translation: Detected language is invalid');
        //   }
        //   from = res.detectedLanguageCode;
        // }
        if (!from) from = res.detectedLanguageCode as TranslationLanguage; // should strictly check or not :thinking:
        return { text: res.translatedText ?? '', to, from };
      },
    };
  },
};
