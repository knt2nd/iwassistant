import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { isLanguage, isRegionLocale, omitObject, toLanguage, toRegionLocales } from '../utils';
import type { EngineManager } from './EngineManager';
import { EventEmitter } from './EventEmitter';
import type { Logger } from './Logger';
import type { AttachedCommand, PluginInterface } from './PluginAdapter';
import { PluginAdapter } from './PluginAdapter';

const DefaultActivationWord: I18n<{ example: string; patterns: string[] }> = {
  en: {
    example: 'OK assistant, ',
    patterns: ['assistant', 'assistance'],
  },
  ja: {
    example: 'OK アシスタント、',
    patterns: ['シスタント', 'しすたんと', 'イワシ', 'いわし', '鰯'],
  },
  zh: {
    example: 'OK 助理，',
    patterns: ['助理'],
  },
};

// https://freesound.org/people/pan14/packs/16196/
const BeepSound = {
  success: readFileSync(join(__dirname, '../../../assets/ogg/beep/success.ogg')), // 263124
  failure: readFileSync(join(__dirname, '../../../assets/ogg/beep/failure.ogg')), // 263123
};

type CommandInterpreter = AttachedCommand & {
  parsers: Map<Locale, { pattern: RegExp; options: Record<string, number> }[]>;
};

export type InterpretedCommand = AttachedCommand & {
  locale: Locale;
  options: Record<string, string>;
  script: string;
};

export type TranscribeOptions = {
  engine: { name: string; locale: Locale };
  request: STTRequest;
};

export type CreateSpeechOptions = {
  engine: { name: string; locale: Locale };
  request: TTSRequest;
};

export type AssistantOptions = {
  /**
   * Activation settings
   */
  activation?: {
    /**
     * Activation word i18n
     */
    word?: I18n<{
      /**
       * Activation word example, to be used for help
       */
      example: string;
      /**
       * Activation word patterns, RegExp format
       */
      patterns: string[];
    }>;
  };
};

export abstract class Assistant<T extends PluginInterface> extends PluginAdapter<T> {
  abstract readonly log: Logger;
  abstract readonly engines: EngineManager;
  abstract readonly audioPlayer: IAudioPlayer;
  abstract run(options: { command: InterpretedCommand; source: RecognizableAudio }): void;
  abstract createSpeech(options: CreateSpeechOptions): PlayableSpeech;
  readonly defaultTTS: { name: string; locale: Locale; voice: string; speed: number; pitch: number };
  readonly defaultSTT: { name: string; locale: Locale; voice: string };
  readonly activation: { examples: I18n<string>; pattern: RegExp };
  readonly #interpreters: CommandInterpreter[];

  constructor(options: AssistantOptions, errorHandler: ErrorHandler) {
    super(errorHandler);
    this.defaultTTS = { name: '', locale: 'en', voice: '', speed: 10, pitch: 10 };
    this.defaultSTT = { name: '', locale: 'en', voice: '' };
    const activationWord = options.activation?.word ?? DefaultActivationWord;
    this.activation = {
      examples: Object.fromEntries(Object.entries(activationWord).map(([locale, { example }]) => [locale, example])),
      pattern: new RegExp(
        `(${Object.values(activationWord)
          .map(({ patterns }) => patterns.join('|'))
          .join('|')})(.*)`,
        'is',
      ),
    };
    this.#interpreters = [];
  }

  protected initializeAssistant(): void {
    this.#initializeDefaultConfigs();
    this.#initializeInterpreters();
  }

  #initializeDefaultConfigs(): void {
    const pairs = [
      {
        engine: this.engines.getTTS({ locale: this.locale }),
        config: this.defaultTTS,
      },
      {
        engine: this.engines.getSTT({ locale: this.locale }),
        config: this.defaultSTT,
      },
    ];
    for (const { engine, config } of pairs) {
      config.name = engine.name;
      config.locale = this.locale;
      config.voice = engine.defaultVoices[this.locale] ?? engine.defaultVoices[toLanguage(this.locale)] ?? '';
    }
  }

  #initializeInterpreters(): void {
    const locales = new Set<Locale>();
    for (const locale of [this.locale, ...(Object.keys(this.activation.examples) as Locale[])]) {
      locales.add(locale);
      if (isLanguage(locale)) {
        for (const rl of toRegionLocales(locale)) {
          locales.add(rl);
        }
      } else {
        locales.add(toLanguage(locale));
      }
    }
    for (const { id, name, plugin, execute } of this.commands.values()) {
      const interpreter: CommandInterpreter = { id, name, plugin, execute, parsers: new Map() };
      for (const locale of locales) {
        const patterns = plugin.i18n[locale]?.command?.[name]?.patterns;
        if (!patterns) continue;
        interpreter.parsers.set(
          locale,
          patterns
            .map((pattern) =>
              typeof pattern === 'string'
                ? { format: pattern, options: {} }
                : { format: pattern[0], options: pattern[1] },
            )
            .filter((pattern) => pattern.format.length > 0)
            .map((pattern) => ({ pattern: new RegExp(pattern.format, 'is'), options: pattern.options })),
        );
      }
      if (interpreter.parsers.size === 0) continue;
      this.#interpreters.push(interpreter);
    }
    this.log.debug?.(
      'Interpreter:',
      locales,
      this.#interpreters.map((interpreter) => omitObject(interpreter, ['plugin'])),
    );
  }

  interpret(text: string): InterpretedCommand | null {
    const matched = text.match(this.activation.pattern);
    if (!matched) return null;
    const script = matched.at(-1);
    if (!script) return null;
    for (const interpreter of this.#interpreters) {
      for (const [locale, parsers] of interpreter.parsers) {
        for (const parser of parsers) {
          const matched = script.match(parser.pattern);
          if (matched) {
            return {
              id: interpreter.id,
              name: interpreter.name,
              plugin: interpreter.plugin,
              execute: interpreter.execute,
              locale: locale,
              options: Object.fromEntries(
                Object.entries(parser.options).map((option) => [option[0], matched[option[1]] ?? '']),
              ),
              script,
            };
          }
        }
      }
    }
    return null;
  }

  async translate(request: TranslatorRequest): Promise<TranslatorResponse> {
    const translator = this.engines.getTranslator({ language: request });
    return translator.translate(request);
  }

  beep(soundName: keyof typeof BeepSound): boolean {
    if (!this.audioPlayer.active) return false;
    const audio = this.createAudio(async () => {
      const resource = new Readable({ read: () => {} });
      resource.push(BeepSound[soundName]);
      resource.push(null);
      return Promise.resolve(resource);
    });
    return this.audioPlayer.play(audio);
  }

  speak(options: string | CreateSpeechOptions): boolean {
    if (!this.audioPlayer.active) return false;
    if (typeof options === 'string') {
      options = {
        engine: {
          name: this.defaultTTS.name,
          locale: this.defaultTTS.locale,
        },
        request: {
          voice: this.defaultTTS.voice,
          speed: this.defaultTTS.speed,
          pitch: this.defaultTTS.pitch,
          text: options,
        },
      };
    }
    const speech = this.createSpeech(options);
    return this.audioPlayer.play(speech);
  }

  createAudio(generator: () => Promise<Readable>): PlayableAudio {
    return new PlayableAudioImpl(generator, this.log.error);
  }

  protected createEmptyAudioResource(): Readable {
    const resource = new Readable({ read: () => {} });
    resource.push(null);
    return resource;
  }

  protected fallbackVoice(
    engine: { name: string; defaultVoices: I18n<string> },
    options: { engine: { name: string; locale: Locale }; request: { voice: string } },
  ): void {
    if (engine.name !== options.engine.name || options.request.voice === '') {
      const locale = options.engine.locale;
      if (isRegionLocale(locale)) {
        const lang = toLanguage(locale);
        options.request.voice = engine.defaultVoices[locale] ?? engine.defaultVoices[lang] ?? '';
      } else {
        options.request.voice = engine.defaultVoices[locale] ?? '';
      }
    }
  }
}

class PlayableAudioImpl extends EventEmitter<{ error: [error: unknown]; ready: [] }> implements PlayableAudio {
  readonly #generator: () => Promise<Readable>;
  resource: Readable | undefined;

  constructor(generator: () => Promise<Readable>, errorHandler: ErrorHandler) {
    super(errorHandler);
    this.#generator = generator;
  }

  async generate(): Promise<void> {
    if (this.resource) return;
    try {
      this.resource = await this.#generator();
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
    }
  }
}
