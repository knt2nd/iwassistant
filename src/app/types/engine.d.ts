type VoiceLocales = I18n<Record<string, string>>;

type IStore = {
  readonly name: string;
  get(key: string): Promise<BasicObject | undefined>;
  set(key: string, value: BasicObject): Promise<boolean>;
};

type TranslatorRequest = {
  text: string;
  to: TranslationLanguage;
  from?: TranslationLanguage;
};

type TranslatorResponse = Required<TranslatorRequest>;

type ITranslator = {
  readonly name: string;
  readonly active: boolean;
  readonly languages: TranslationLanguage[];
  translate(request: TranslatorRequest): Promise<TranslatorResponse>;
};

type TTSRequest = {
  voice: string;
  speed: number;
  pitch: number;
  text: string;
};

type TTSResponse = TTSRequest & {
  resource: import('node:stream').Readable;
};

type ITextToSpeech = {
  readonly name: string;
  readonly active: boolean;
  readonly locales: VoiceLocales;
  readonly defaultVoices: I18n<string>;
  generate(request: TTSRequest): Promise<TTSResponse>;
};

type STTRequest<T extends AssistantType = AssistantType> = {
  voice: string;
  interim: boolean;
  audio: RecognizableAudio<T>;
};

type ISpeechToText = {
  readonly name: string;
  readonly active: boolean;
  readonly locales: VoiceLocales;
  readonly defaultVoices: I18n<string>;
  transcribe(request: STTRequest): boolean;
};

type CreateEngineContext<T> = {
  config: T extends object ? T : {};
  app: import('../classes').App;
};

type IEngine<T extends BasicObject | undefined = undefined> = { description: string } & (T extends object
  ? {
      config: T;
    }
  : {}) &
  (
    | {
        name: `store-${string}`;
        createStore(context: CreateEngineContext<T>): Awaitable<Omit<IStore, 'name'>>;
      }
    | {
        name: `translator-${string}`;
        createTranslator(context: CreateEngineContext<T>): Awaitable<Omit<ITranslator, 'name'>>;
      }
    | {
        name: `tts-${string}`;
        createTTS(context: CreateEngineContext<T>): Awaitable<Omit<ITextToSpeech, 'name' | 'defaultVoices'>>;
      }
    | {
        name: `stt-${string}`;
        createSTT(context: CreateEngineContext<T>): Awaitable<Omit<ISpeechToText, 'name' | 'defaultVoices'>>;
      }
  );

type AvailableEngine<T extends BasicObject | undefined = undefined> = T extends object ? Partial<T> | true : true;

interface AvailableEngines {}
