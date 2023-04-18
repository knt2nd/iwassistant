import { TranslationLanguages } from '../../locales';
import { isTranslationLanguage } from '../../utils';

const MaxLength = 1800;

const UnavailableLanguages = new Set(['fil', 'nb', 'tn', 'ss', 've']);

const AvailableLanguages = Object.keys(TranslationLanguages).filter(
  (lang) => !UnavailableLanguages.has(lang),
) as TranslationLanguage[];

function createResult(from: string | undefined, response: unknown): Result {
  const res = response as DeepPartial<[[string]][]> | undefined;
  const text = res?.[0]?.map((data) => data?.[0]).join('');
  if (from === undefined) from = res?.[8]?.[0]?.[0];
  if (text === undefined || from === undefined || !isTranslationLanguage(from)) {
    throw new Error('Google Translate: Invalid response');
  }
  return { text, from };
}

type Result = {
  text: string;
  from: TranslationLanguage;
};

export type Config = {
  /**
   * Hostname
   * @default "translate.googleapis.com"
   */
  host: string;
};

export const engine: IEngine<Config> = {
  name: 'translator-google-translate',
  description: 'Google Translate translator',
  config: {
    host: 'translate.googleapis.com',
  },
  createTranslator({ config }) {
    const baseURL = `https://${config.host}/translate_a/single?client=gtx&dt=t`;
    return {
      active: true,
      languages: AvailableLanguages,
      async translate({ text, to, from }) {
        if (text.length > MaxLength) text = text.slice(0, Math.max(0, MaxLength));
        const url = new URL(baseURL);
        url.searchParams.set('sl', from ?? 'auto');
        url.searchParams.set('tl', to);
        url.searchParams.set('q', text);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Google Translate: ${res.status} ${res.statusText} ${url.toString()}`);
        return { to, ...createResult(from, await res.json()) };
      },
    };
  },
};
