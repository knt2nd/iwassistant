// just mock for now

import type { Readable } from 'node:stream';
import type { App } from './App';
import type { AssistantOptions, IAudioPlayer } from './Assistant';
import { Assistant } from './Assistant';
import type { Datastore } from './Datastore';
import type { EngineManager } from './EngineManager';
import { EventEmitter } from './EventEmitter';
import type { Logger } from './Logger';

enum Status {
  unready,
  preparing,
  ready,
  destroying,
  destroyed,
}

type CreateSpeechOptions = {
  engine: { name: string; locale: Locale };
  request: TTSRequest;
};

export type HomeAssistantInterface = {
  beforeTranscribe(request: STTRequest<'home'>): Awaitable<void>;
  beforeDestroy(): Awaitable<void>;
  onReady(): Awaitable<void>;
};

export type HomeAssistantOptions = {};

export class HomeAssistant extends Assistant<HomeAssistantInterface> {
  readonly locale: Locale;
  readonly data: Datastore<'home'>;
  readonly log: Logger;
  readonly engines: EngineManager;
  readonly audioPlayer: IAudioPlayer;
  readonly #options: HomeAssistantOptions | undefined;
  #status: Status;

  constructor(
    locale: Locale,
    options: HomeAssistantOptions | undefined,
    assistantOptions: AssistantOptions | undefined,
    di: { data: Datastore<'home'>; log: Logger; engines: EngineManager },
  ) {
    const log = di.log.createChild('HOME');
    super(assistantOptions ?? {}, log.error);
    this.locale = locale;
    this.data = di.data;
    this.log = log;
    this.engines = di.engines;
    this.audioPlayer = new HomeAudioPlayer();
    this.#options = options;
    this.#status = Status.unready;
  }

  async setup(app: App): Promise<void> {
    if (this.#status !== Status.unready || !this.#options) return;
    this.#status = Status.preparing;
    await this.data.setup(app.engines.getStore(), this.log.error);
    await this.attach(app.plugins, { type: 'home', assistant: this, app });
    this.#status = Status.ready;
    this.emit('ready');
  }

  async destroy(): Promise<void> {
    if (this.#status !== Status.ready) return;
    this.#status = Status.destroying;
    await this.hook('destroy').catch(this.log.error);
    await this.data.destroy().catch(this.log.error);
    this.#status = Status.destroyed;
  }

  run(): void {}

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

  createSpeech(options: CreateSpeechOptions): PlayableSpeech<'home'> {
    const tts = this.engines.getTTS(options.engine);
    this.fallbackVoice(tts, options);
    const speech = new PlayableSpeechImpl({
      generator: async (request) => {
        if (request.text.length === 0) return { ...request, resource: this.createEmptyAudioResource() };
        return tts.generate(request);
      },
      locale: options.engine.locale,
      request: options.request,
      errorHandler: this.log.error,
    });
    return speech;
  }
}

class HomeAudioPlayer extends EventEmitter<{}> implements IAudioPlayer {
  active = false;
  play(): boolean {
    return false;
  }
  next(): boolean {
    return false;
  }
  stop(): boolean {
    return false;
  }
}

class PlayableSpeechImpl
  extends EventEmitter<{ error: [error: unknown]; ready: [] }>
  implements PlayableSpeech<'home'>
{
  readonly #generator: (request: TTSRequest) => Promise<TTSResponse>;
  readonly locale: Locale;
  readonly request: TTSRequest;
  response: TTSResponse | undefined;

  constructor(options: {
    generator: (request: TTSRequest) => Promise<TTSResponse>;
    locale: Locale;
    request: TTSRequest;
    errorHandler: ErrorHandler;
  }) {
    super(options.errorHandler);
    this.#generator = options.generator;
    this.locale = options.locale;
    this.request = options.request;
  }

  get resource(): Readable | undefined {
    return this.response?.resource;
  }

  async generate(): Promise<void> {
    if (this.response) return;
    try {
      this.response = await this.#generator(this.request);
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
    }
  }
}
