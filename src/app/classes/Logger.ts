import { Console } from 'node:console';
import type { InspectOptions } from 'node:util';
import { inspect } from 'node:util';
import { formatDate } from '../utils';
import { EventEmitter } from './EventEmitter';

const Prefixes = ['[DBG]', '[INF]', '[WRN]', '[ERR]'] as const;

const Colors = ['35', '36', '33', '31'] as const;

const Levels = ['debug', 'info', 'warn', 'error'] as const;

enum Level {
  debug,
  info,
  warn,
  error,
}

export type LoggerOptions = {
  /**
   * Log level
   * @default "info"
   */
  level?: keyof typeof Level;
  /**
   * Log color
   * @default true
   */
  color?: boolean;
  /**
   * Log timestamp
   * @default true
   */
  timestamp?: boolean;
  /**
   * Custom console
   */
  console?: Console;
};

export class Logger extends EventEmitter<Record<keyof typeof Level, unknown[]>> {
  readonly #level: Level;
  readonly #color: boolean;
  readonly #timestamp: boolean;
  readonly #prefix: string;
  readonly #console: Console;
  readonly #inspectOptions: { default: InspectOptions; debug: InspectOptions };
  readonly debug?: (...args: unknown[]) => void;

  constructor(options: LoggerOptions & { prefix?: string } = {}) {
    super();
    this.#level = Level[options.level ?? 'info'];
    this.#color = options.color ?? true;
    this.#timestamp = options.timestamp ?? true;
    this.#prefix = options.prefix ?? '';
    if (options.console) {
      this.#console = options.console;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.#color && process.stdout.getColorDepth && process.stdout.getColorDepth() < 4) this.#color = false;
      this.#console = new Console({ stdout: process.stdout, stderr: process.stderr, colorMode: false });
    }
    this.#inspectOptions = {
      default: { colors: this.#color, compact: true },
      debug: {
        colors: this.#color,
        depth: 10, // default: 2
        compact: 1, // default: 3
        // breakLength: 80, // default: 80
        // maxArrayLength: 100, // default: 100
        // maxStringLength: 10_000, // default: 10_000
        // showHidden: false, // default: false
        // showProxy: false, // default: false
        // getters: false, // default: false
        // numericSeparator: false, // default: false
      },
    };
    if (this.#level !== Level.debug) return;
    this.debug = (...args) => {
      this.#console.debug(this.#createLog(Level.debug, args, true));
      this.emit('debug', ...args);
    };
  }

  info = (...args: unknown[]): void => {
    if (this.#level > Level.info) return;
    this.#console.info(this.#createLog(Level.info, args));
    this.emit('info', ...args);
  };

  warn = (...args: unknown[]): void => {
    if (this.#level > Level.warn) return;
    this.#console.warn(this.#createLog(Level.warn, args));
    this.emit('warn', ...args);
  };

  error = (...args: unknown[]): void => {
    this.#console.error(this.#createLog(Level.error, args));
    this.emit('error', ...args);
  };

  #createPrefix(level: Level): string {
    if (this.#color) {
      return this.#timestamp
        ? `\u001B[${Colors[level]}m[${formatDate()}] ${Prefixes[level]}${this.#prefix}\u001B[0m`
        : `\u001B[${Colors[level]}m${Prefixes[level]}${this.#prefix}\u001B[0m`;
    } else {
      return this.#timestamp
        ? `[${formatDate()}] ${Prefixes[level]}${this.#prefix}`
        : `${Prefixes[level]}${this.#prefix}`;
    }
  }

  #createLog(level: Level, args: unknown[], debug = false): string {
    const options = debug ? this.#inspectOptions.debug : this.#inspectOptions.default;
    const prefix = this.#createPrefix(level);
    return `${prefix} ${args
      .map((arg) => (typeof arg === 'string' ? arg : inspect(arg, options)).replaceAll('\n', `\n${prefix} `))
      .join(debug ? `\n${prefix} ` : ' ')}`;
  }

  createChild(prefix: string): Logger {
    const log = new Logger({
      level: Levels[this.#level],
      color: this.#color,
      timestamp: this.#timestamp,
      console: this.#console,
      prefix: `${this.#prefix} [${prefix}]`,
    });
    for (const eventName of this.eventNames()) {
      for (const listener of this.listeners(eventName)) {
        log.on(eventName, listener);
      }
    }
    return log;
  }
}

// process.stdout.getColorDepth = () => 4;
// const log = new Logger({
//   level: 'debug',
//   color: true,
//   timestamp: true,
//   // console: new Console({
//   //   stdout: process.stdout,
//   //   stderr: process.stderr,
//   // }),
// });
// const enText = `Folklore, legends, myths and fairy tales have followed childhood through the ages, for every healthy youngster has a wholesome and instinctive love for stories fantastic, marvelous and manifestly unreal. The winged fairies of Grimm and Andersen have brought more happiness to childish hearts than all other human creations.
// Yet the old time fairy tale, having served for generations, may now be classed as “historical” in the children’s library; for the time has come for a series of newer “wonder tales” in which the stereotyped genie, dwarf and fairy are eliminated, together with all the horrible and blood-curdling incidents devised by their authors to point a fearsome moral to each tale. Modern education includes morality; therefore the modern child seeks only entertainment in its wonder tales and gladly dispenses with all disagreeable incident.
// Having this thought in mind, the story of “The Wonderful Wizard of Oz” was written solely to please children of today. It aspires to being a modernized fairy tale, in which the wonderment and joy are retained and the heartaches and nightmares are left out.`;
// const jaText = `山路を登りながら、こう考えた。
// 智に働けば角が立つ。情に棹させば流される。意地を通せば窮屈だ。とかくに人の世は住みにくい。
// 住みにくさが高じると、安い所へ引き越したくなる。どこへ越しても住みにくいと悟った時、詩が生れて、画が出来る。`;
// const args = [
//   enText,
//   jaText,
//   10_000,
//   true,
//   undefined,
//   null,
//   [1, 2, 3],
//   new (class A {
//     constructor(public a: string, public b: number, public c: object) {}
//   })('abc', 1, { d: 1 }),
//   { a: 'abc', b: 1, c: true },
//   { a: 'abc', b: 1, c: { d: true, e: [1, 2], f: { g: null, h: { l: {} } } } },
//   { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: { l: {} } } } } } } } } } } } },
// ];
// log.debug?.(...args);
// log.info(...args);
// log.warn(...args);
// log.error(...args);
