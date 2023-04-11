import { OpusEncoder } from '@discordjs/opus';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import type { WebSocket } from 'ws';
import { Server } from 'ws';
import type { App } from '../../classes/App';
import { EventEmitter } from '../../classes/EventEmitter';
import type { Logger } from '../../classes/Logger';
import { Locales } from '../../locales';
import { isRegionLocale } from '../../utils';

const DefaultVoice = 'en-US';
const AssetsDir = join(__dirname, '../../../../assets/');
const UserDataDir = join(__dirname, '../../../../tmp/chrome/');

// https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/node/ChromeLauncher.ts
const LaunchArguments = [
  // '--allow-pre-commit-input',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-extensions-with-background-pages',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  // '--enable-automation',
  // '--enable-blink-features=IdleDetection',
  // '--enable-features=NetworkServiceInProcess2',
  // '--export-tagged-pdf',
  // '--force-color-profile=srgb',
  // '--metrics-recording-only',
  '--no-first-run',
  // '--password-store=basic',
  // '--use-mock-keychain',
  // extend
  '--no-default-browser-check',
  '--hide-crash-restore-bubble',
  '--autoplay-policy=no-user-gesture-required',
  '--profile-directory=User',
];

// https://www.google.com/intl/en/chrome/demos/speech.html
const AvailableLocales: (`${Language}-${string}` | [locale: Locale, id: string, label: string])[] = [
  'af-ZA',
  'am-ET',
  'az-AZ',
  'bg-BG',
  'bn-BD',
  'bn-IN',
  'ca-ES',
  'cs-CZ',
  'da-DK',
  'de-DE',
  'el-GR',
  'en-US',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-GH',
  'en-IN',
  'en-KE',
  'en-NG',
  'en-NZ',
  'en-PH',
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
  'eu-ES',
  'fi-FI',
  'fil-PH',
  'fr-FR',
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
  'ja-JP',
  'jv-ID',
  'ka-GE',
  'km-KH',
  'kn-IN',
  'ko-KR',
  'lo-LA',
  'lt-LT',
  'lv-LV',
  'ml-IN',
  'mr-IN',
  'ms-MY',
  'nb-NO',
  'ne-NP',
  'nl-NL',
  'pl-PL',
  'pt-PT',
  'pt-BR',
  'ro-RO',
  'ru-RU',
  'si-LK',
  'sk-SK',
  'sl-SI',
  'sr-RS',
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
  'tr-TR',
  'uk-UA',
  'ur-IN',
  'ur-PK',
  'vi-VN',
  'zu-ZA',
  ['zh-CN', 'cmn-Hans-CN', '中文 - 中国大陆 (简体)'],
  ['zh-TW', 'cmn-Hant-TW', '中文 - 台灣 (繁體)'],
  ['zh-HK', 'yue-Hant-HK', '粵語 - 香港 (繁體)'],
  ['zh-HK', 'cmn-Hans-HK', '中文 - 香港 (简体)'],
];

function availableLocales(): VoiceLocales {
  const locales: VoiceLocales = {};
  for (const l of AvailableLocales) {
    const locale = typeof l === 'string' ? (isRegionLocale(l) ? l : (l.split('-')[0] as Language)) : l[0];
    // if (locale !== 'zh-HK' && locales[locale]) throw new Error(locale);
    const [id, label] = typeof l === 'string' ? [l, Locales[locale]] : [l[1], l[2]];
    const value = locales[locale] ?? {};
    value[id] = `${locale}: ${label}`;
    locales[locale] = value;
  }
  return locales;
}

function chromePath(platform: string): string {
  switch (platform) {
    case 'win32': {
      return `${process.env['PROGRAMFILES'] || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`;
    }
    case 'darwin': {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }
    case 'linux': {
      return '/opt/google/chrome/chrome';
    }
    default: {
      throw new Error('Unable to detect Chrome path');
    }
  }
}

function createHTML(script: string): string {
  return `<!DOCTYPE html><title>STT</title><link rel="icon" href="data:,"><script>${script}</script>`;
}

type ChromeLauncherOptions = {
  port: number;
  platform: string;
  exec: string;
  input: string;
  output: string;
};

class ChromeLauncher extends EventEmitter<{ error: [error: Error] }> {
  readonly #log: Logger;
  readonly #platform: string;
  readonly #exec: string;
  readonly #input: string;
  readonly #output: string;
  readonly #baseURL: string;
  readonly #launchURL: string;
  readonly #dataDir: string;
  readonly #retry: { counter: number; timer?: NodeJS.Timeout };

  constructor(options: ChromeLauncherOptions, log: Logger) {
    super();
    this.#log = log;
    this.#platform = options.platform;
    this.#exec = options.exec;
    this.#input = options.input;
    this.#output = options.output;
    this.#baseURL = `http://localhost:${options.port}`;
    this.#launchURL = `${this.#baseURL}/stt#${this.#input}`;
    this.#dataDir = join(UserDataDir, options.port.toString());
    this.#retry = { counter: 0 };
  }

  async setup(): Promise<undefined | string> {
    let preferences:
      | undefined
      | DeepPartial<{
          media: {
            device_id_salt: string;
            default_audio_capture_device: string;
          };
          profile: {
            content_settings: {
              exceptions: {
                media_stream_mic: Record<string, { setting: 1 }>;
              };
            };
          };
        }>;
    const filePath = join(this.#dataDir, 'User', 'Preferences');
    const loadFile = (): void => void (preferences = JSON.parse(readFileSync(filePath, 'utf8')) as typeof preferences);
    if (existsSync(filePath)) {
      loadFile();
    } else {
      await new Promise<void>((resolve) => this.#launch(`${this.#baseURL}/init`, resolve));
      loadFile();
      if (!preferences?.profile?.content_settings?.exceptions?.media_stream_mic) throw new Error('Invalid preferences');
      if (!preferences.media) preferences.media = {};
      if (this.#output.length > 0) preferences.media.default_audio_capture_device = this.#output;
      preferences.media.device_id_salt = '00000000000000000000000000000000'; // prevent randomization
      preferences.profile.content_settings.exceptions.media_stream_mic[`${this.#baseURL},*`] = { setting: 1 };
      writeFileSync(filePath, JSON.stringify(preferences));
    }
    return preferences?.media?.default_audio_capture_device;
  }

  launch(): void {
    const onClose = (): void => void setTimeout(() => this.#launch(this.#launchURL, onClose), 1000);
    this.#launch(this.#launchURL, onClose);
  }

  #launch(url: string, onClose: () => void): void {
    clearTimeout(this.#retry.timer);
    if (this.#retry.counter++ >= 5) {
      this.emit('error', new Error('Unable to launch Chrome'));
      return;
    }
    this.#retry.timer = setTimeout(() => (this.#retry.counter = 0), 60_000);
    const args = [...LaunchArguments, url, `--user-data-dir=${this.#dataDir}`];
    if (this.#log.debug) {
      args.push('--window-size=800,800', '--auto-open-devtools-for-tabs');
    } else {
      args.push('--window-size=300,300');
    }
    // https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/node/BrowserRunner.ts
    spawn(this.#exec, args, { detached: this.#platform !== 'win32' }).once('close', onClose);
  }
}

class ChromeAdapter extends EventEmitter<{
  error: [error: Error];
  ready: [report: string];
  start: [];
  stop: [];
  result: [transcript: string, isFinal: boolean];
}> {
  readonly #log: Logger;
  readonly #port: number;
  #ws: WebSocket | undefined;

  constructor(port: number, log: Logger) {
    super();
    this.#log = log;
    this.#port = port;
  }

  get active(): boolean {
    return !!this.#ws;
  }

  async setup(): Promise<void> {
    const server = createServer((req, res) => {
      switch (req.url) {
        case '/init': {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(createHTML('window.close();'));
          break;
        }
        case '/stt': {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(createHTML(readFileSync(join(AssetsDir, './js/chrome-stt.js'), 'utf8')));
          break;
        }
        case '/sample': {
          res.writeHead(200, { 'Content-Type': 'audio/ogg' });
          res.end(readFileSync(join(AssetsDir, './ogg/beep/success.ogg')));
          break;
        }
        default: {
          res.writeHead(404);
          res.end();
        }
      }
    });
    const wss = new Server({ server });
    wss.on('error', (error) => this.emit('error', error));
    wss.on('connection', (ws) => {
      this.#ws = ws;
      ws.on('close', () => (this.#ws = undefined));
      ws.on('error', (error) => this.emit('error', error));
      ws.on('message', (data) => {
        this.#log.debug?.(`[CA:${this.#port}] << ${data.toString().replaceAll('\t', ':')}`);
        const [eventName, ...args] = data.toString().split('\t');
        switch (eventName) {
          case 'start':
          case 'stop': {
            this.emit(eventName);
            break;
          }
          case 'ready': {
            this.emit('ready', args[0] ?? '');
            break;
          }
          case 'result': {
            if (args[1]) this.emit('result', args[1], args[0] === '1');
            break;
          }
          case 'error': {
            if (args[0]) this.emit('error', new Error(args[0]));
            break;
          }
        }
      });
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Unable to create a Chrome adapter')), 5000);
      wss.once('listening', () => {
        clearTimeout(timer);
        resolve();
      });
      server.listen(this.#port);
    });
  }

  call(...args: [eventName: 'start', interim: '0' | '1', voice: string] | [eventName: 'stop' | 'fix']): void {
    if (!this.#ws) return;
    this.#log.debug?.(`[CA:${this.#port}] >> ${args.join(':')}`);
    this.#ws.send(args.join('\t'));
  }

  play(data: Float32Array): void {
    if (!this.#ws) return;
    // this.#debug?.(`[CA:${this.#port}] >> ${data.length}`);
    this.#ws.send(data);
  }
}

class ChromeSTT extends EventEmitter<{ error: [error: Error] }> {
  readonly id: number;
  readonly #decoder: AudioDecoder;
  readonly #launcher: ChromeLauncher;
  readonly #adapter: ChromeAdapter;
  readonly #queue: STTRequest[];

  constructor(options: ChromeLauncherOptions, decoder: AudioDecoder, log: Logger) {
    super();
    this.id = options.port;
    this.#decoder = decoder;
    this.#launcher = new ChromeLauncher(options, log);
    this.#adapter = new ChromeAdapter(options.port, log);
    this.#launcher.on('error', (error) => void this.emit('error', error));
    this.#adapter.on('error', (error) => void this.emit('error', error));
    this.#queue = [];
  }

  get active(): boolean {
    return this.#adapter.active;
  }

  get queued(): number {
    return this.#queue.length;
  }

  async setup(): Promise<{ input: string; output: string | undefined }> {
    this.#adapter.on('start', () => {
      if (!this.#queue[0]) return this.#adapter.call('stop');
      const request = this.#queue[0];
      const audio = request.audio;
      const decode = this.#decoder[audio.type];
      audio.emit('start', request);
      audio.once('abort', this.#onAbort);
      audio.resource.once('close', () => this.#adapter.call('fix'));
      audio.resource.on('data', (chunk: Buffer) => this.#adapter.play(decode(chunk)));
    });
    this.#adapter.on('stop', () => {
      if (!this.#queue[0]) return;
      const request = this.#queue[0];
      const audio = request.audio;
      if (!audio.aborted) {
        if (audio.resource.closed) {
          audio.emit('end', request);
        } else {
          audio.off('abort', this.#onAbort);
          audio.abort();
        }
      }
      this.#queue.shift();
      if (this.#queue[0]) this.#start(this.#queue[0]);
    });
    this.#adapter.on('result', (transcript, isFinal) => {
      if (!this.#queue[0]) return;
      const audio = this.#queue[0].audio;
      audio.emit('result', transcript, isFinal);
      if (isFinal) audio.results.push(transcript);
    });
    await this.#adapter.setup();
    const output = await this.#launcher.setup();
    const input = await new Promise<string>((resolve) => {
      this.#adapter.once('ready', resolve);
      this.#launcher.launch();
    });
    return { input, output };
  }

  #start(request: STTRequest): void {
    this.#adapter.call('start', request.interim ? '1' : '0', request.voice || DefaultVoice);
  }

  #onAbort = (): void => {
    this.#adapter.call('stop');
  };

  transcribe(request: STTRequest): void {
    const kickStart = this.#queue.push(request) === 1;
    if (kickStart) this.#start(request);
  }
}

class AudioDecoder implements Record<AssistantType, (chunk: Buffer) => Float32Array> {
  readonly #opus = new OpusEncoder(48_000, 1);

  guild = (chunk: Buffer): Float32Array => {
    const pcm8 = new Int8Array(this.#opus.decode(chunk).filter((_, i) => i % 2 !== 0));
    return Float32Array.from(pcm8, (octet) => octet / 0xff);
  };

  // just mock for now
  home = (): Float32Array => {
    return new Float32Array();
  };
}

class LoadBalancer {
  readonly #log: Logger;
  readonly #instances: ChromeSTT[];

  constructor(options: Config, app: App) {
    this.#log = app.log.createChild('STT');
    const decoder = new AudioDecoder();
    const platform = app.platform;
    const exec = options.exec || chromePath(platform);
    this.#instances = options.instances.map((i) => new ChromeSTT({ ...i, exec, platform }, decoder, this.#log));
  }

  async setup(): Promise<void> {
    const promises: Promise<{ id: number; input: string; output: string | undefined }>[] = [];
    for (const instance of this.#instances) {
      instance.on('error', this.#log.error);
      promises.push(instance.setup().then((report) => ({ id: instance.id, ...report })));
    }
    for (const report of await Promise.all(promises)) {
      if (report.output) this.#log.info(`[Chrome:${report.id}] Output Device: ${report.output}`);
      this.#log.info(`[Chrome:${report.id}] Input Devices:\n${report.input}`);
    }
  }

  distribute(request: STTRequest): boolean {
    const instance = this.#select();
    if (!instance) return false;
    this.#log.debug?.(`[LB] ${instance.id} <= ${this.#instances.map((i) => [i.id, i.queued, i.active]).join('/')}`);
    (async () => {
      if (request.audio.prepare) await request.audio.prepare();
      instance.transcribe(request);
    })().catch(this.#log.error);
    return true;
  }

  #select(): ChromeSTT | undefined {
    if (this.#instances.length === 1) {
      const instance = this.#instances[0];
      return instance?.active ? instance : undefined;
    }
    let selected: ChromeSTT | undefined;
    let min = Number.POSITIVE_INFINITY;
    for (const instance of this.#instances) {
      if (!instance.active) continue;
      if (instance.queued === 0) {
        selected = instance;
        break;
      }
      if (min > instance.queued) {
        selected = instance;
        min = instance.queued;
      }
    }
    return selected;
  }
}

export type Config = {
  /**
   * Executable path of Google Chrome
   */
  exec: string;
  /**
   * Instance settings
   */
  instances: {
    /**
     * Local port number: 1024-65535
     */
    port: number;
    /**
     * Input(playback) device name
     */
    input: string;
    /**
     * Output(recording) device id
     */
    output: string;
  }[];
};

export const engine: IEngine<Config> = {
  name: 'stt-google-chrome',
  description: 'Google Chrome STT',
  config: {
    exec: '',
    instances: [
      {
        port: 18_400,
        input: '',
        output: '',
      },
    ],
  },
  async createSTT({ config, app }) {
    const lb = new LoadBalancer(config, app);
    await lb.setup();
    return {
      active: true,
      locales: availableLocales(),
      transcribe: (request) => lb.distribute(request),
    };
  },
};
