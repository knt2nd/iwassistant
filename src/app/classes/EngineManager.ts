import { Readable } from 'node:stream';
import { isRegionLocale, toLanguage } from '../utils';
import type { App } from './App';
import type { ModuleLoader, ModuleReport } from './ModuleLoader';

function generateDefaultVoices(engine: { locales: I18n<Record<string, string>>; defaultVoices: I18n<string> }): void {
  for (const [locale, voices] of Object.entries(engine.locales) as [Locale, Record<string, string>][]) {
    const lang = toLanguage(locale);
    const voice = Object.keys(voices)[0];
    if (!voice) continue;
    if (!engine.defaultVoices[locale]) engine.defaultVoices[locale] = voice;
    if (!engine.defaultVoices[lang]) engine.defaultVoices[lang] = voice;
  }
}

function selectVoiceEngine<T extends ITextToSpeech | ISpeechToText>(
  dummy: T,
  map: Map<string, T>,
  list: T[],
  query?: { name?: string; locale?: Locale },
): T {
  let engine = query?.name ? map.get(query.name) : undefined;
  if (!engine?.active) {
    const locale = query?.locale;
    if (locale) {
      if (isRegionLocale(locale)) {
        const lang = toLanguage(locale);
        engine = list.find(({ active, defaultVoices }) => active && (defaultVoices[locale] ?? defaultVoices[lang]));
      } else {
        engine = list.find(({ active, defaultVoices }) => active && defaultVoices[locale]);
      }
    } else {
      engine = list.find(({ active }) => active);
    }
  }
  return engine ?? dummy;
}

const DummyEngines: EngineSet = {
  store: {
    name: 'dummy',
    async get() {
      return Promise.resolve(undefined);
    },
    async set() {
      return Promise.resolve(false);
    },
  },
  translator: {
    name: 'dummy',
    active: true,
    languages: [],
    async translate() {
      return Promise.resolve({ text: '', to: 'en', from: 'en' });
    },
  },
  tts: {
    name: 'dummy',
    active: true,
    locales: {},
    defaultVoices: {},
    async generate() {
      const resource = new Readable({ read: () => {} });
      resource.push(null);
      return Promise.resolve({ resource, text: '', voice: '', speed: -1, pitch: -1 });
    },
  },
  stt: {
    name: 'dummy',
    active: true,
    locales: {},
    defaultVoices: {},
    transcribe() {
      return false;
    },
  },
};

enum Status {
  unready,
  preparing,
  ready,
}

type SetupReport = { modules: ModuleReport };

type EngineSet = {
  store: IStore;
  translator: ITranslator;
  tts: ITextToSpeech;
  stt: ISpeechToText;
};

type EngineCreator = {
  name: string;
  description: string;
  config: BasicObject;
  createStore?(context: { config: BasicObject; app: App }): Awaitable<Omit<IStore, 'name'>>;
  createTranslator?(context: { config: BasicObject; app: App }): Awaitable<Omit<ITranslator, 'name'>>;
  createTTS?(context: { config: BasicObject; app: App }): Awaitable<Omit<ITextToSpeech, 'name' | 'defaultVoices'>>;
  createSTT?(context: { config: BasicObject; app: App }): Awaitable<Omit<ISpeechToText, 'name' | 'defaultVoices'>>;
};

export type EngineManagerOptions = Partial<AvailableEngines>;

export class EngineManager {
  readonly dummy: EngineSet;
  readonly maps: { readonly [P in keyof EngineSet]: Map<string, EngineSet[P]> };
  readonly #lists: { readonly [P in keyof EngineSet]: EngineSet[P][] };
  readonly #options: EngineManagerOptions;
  readonly #loader: ModuleLoader<IEngine, EngineCreator>;
  #status: Status;

  constructor(options: EngineManagerOptions, loader: ModuleLoader) {
    this.dummy = DummyEngines;
    this.maps = { store: new Map(), translator: new Map(), tts: new Map(), stt: new Map() };
    this.#lists = { store: [], translator: [], tts: [], stt: [] };
    this.#options = options;
    this.#loader = loader as ModuleLoader<IEngine, EngineCreator>;
    this.#status = Status.unready;
  }

  get #report(): SetupReport {
    return { modules: this.#loader.createReport(this.#options) };
  }

  async setup(app: App): Promise<SetupReport> {
    if (this.#status !== Status.unready) return this.#report;
    this.#status = Status.preparing;
    await this.#loader.load((source) => ({ config: {}, ...source })); // might have config at runtime and overwrite
    const promises: Promise<() => void>[] = [];
    for (const [fullName, config] of Object.entries(this.#options)) {
      const creator = this.#loader.get(fullName);
      const name = fullName.replace(/^\w+-/, '');
      if (!creator || !name) continue;
      const context = { app, config: config === true ? creator.config : { ...creator.config, ...config } };
      promises.push(
        (async () => {
          if (creator.createStore) {
            const engine = { ...(await creator.createStore(context)), name };
            return () => {
              this.maps.store.set(name, engine);
              this.#lists.store.push(engine);
            };
          }
          if (creator.createTranslator) {
            const engine = { ...(await creator.createTranslator(context)), name };
            return () => {
              this.maps.translator.set(name, engine);
              this.#lists.translator.push(engine);
            };
          }
          if (creator.createTTS) {
            const engine = { ...(await creator.createTTS(context)), name, defaultVoices: {} };
            generateDefaultVoices(engine);
            return () => {
              this.maps.tts.set(name, engine);
              this.#lists.tts.push(engine);
            };
          }
          if (creator.createSTT) {
            const engine = { ...(await creator.createSTT(context)), name, defaultVoices: {} };
            generateDefaultVoices(engine);
            return () => {
              this.maps.stt.set(name, engine);
              this.#lists.stt.push(engine);
            };
          }
          throw new Error(`Missing engine creator: ${fullName}`);
        })(),
      );
    }
    for (const callback of await Promise.all(promises)) {
      callback();
    }
    const report = this.#report;
    this.#loader.clear();
    this.#status = Status.ready;
    return report;
  }

  getStore(query?: { name?: string }): IStore {
    const engine = query?.name ? this.maps.store.get(query.name) : this.#lists.store[0];
    return engine ?? this.dummy.store;
  }

  getTranslator(query?: {
    name?: string;
    language?: { to: TranslationLanguage; from?: TranslationLanguage };
  }): ITranslator {
    let engine = query?.name ? this.maps.translator.get(query.name) : undefined;
    if (!engine?.active) {
      const list = this.#lists.translator;
      const to = query?.language?.to;
      const from = query?.language?.from;
      engine = to
        ? list.find(({ active, languages }) => active && languages.includes(to) && (!from || languages.includes(from)))
        : list.find(({ active }) => active);
    }
    return engine ?? this.dummy.translator;
  }

  getTTS(query?: { name?: string; locale?: Locale }): ITextToSpeech {
    return selectVoiceEngine(this.dummy.tts, this.maps.tts, this.#lists.tts, query);
  }

  getSTT(query?: { name?: string; locale?: Locale }): ISpeechToText {
    return selectVoiceEngine(this.dummy.stt, this.maps.stt, this.#lists.stt, query);
  }
}
