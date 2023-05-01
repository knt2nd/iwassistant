import { Logger } from '../../src/app/classes';

const console = {} as Console;

function callAllFuncs(log: Logger): void {
  log.debug?.('debug');
  log.info('info');
  log.warn('warn');
  log.error('error');
}

describe('Logger', () => {
  let results: Partial<Record<'debug' | 'info' | 'warn' | 'error', string>> = {};

  beforeAll(() => {
    console.debug = jest.fn((arg: string) => (results.debug = arg));
    console.info = jest.fn((arg: string) => (results.info = arg));
    console.warn = jest.fn((arg: string) => (results.warn = arg));
    console.error = jest.fn((arg: string) => (results.error = arg));
  });

  beforeEach(() => {
    results = {};
    jest.clearAllMocks();
  });

  describe('level', () => {
    test('undefined', () => {
      callAllFuncs(new Logger({ console, color: false, timestamp: false }));
      expect(results).toEqual({
        info: '[INF] info',
        warn: '[WRN] warn',
        error: '[ERR] error',
      });
    });

    test('debug', () => {
      callAllFuncs(new Logger({ console, level: 'debug', color: false, timestamp: false }));
      expect(results).toEqual({
        debug: '[DBG] debug',
        info: '[INF] info',
        warn: '[WRN] warn',
        error: '[ERR] error',
      });
    });

    test('info', () => {
      callAllFuncs(new Logger({ console, level: 'info', color: false, timestamp: false }));
      expect(results).toEqual({
        info: '[INF] info',
        warn: '[WRN] warn',
        error: '[ERR] error',
      });
    });

    test('warn', () => {
      callAllFuncs(new Logger({ console, level: 'warn', color: false, timestamp: false }));
      expect(results).toEqual({
        warn: '[WRN] warn',
        error: '[ERR] error',
      });
    });

    test('error', () => {
      callAllFuncs(new Logger({ console, level: 'error', color: false, timestamp: false }));
      expect(results).toEqual({
        error: '[ERR] error',
      });
    });
  });

  describe('event', () => {
    test('debug', () => {
      const log = new Logger({ console, level: 'debug' });
      const results: unknown[][] = [];
      log.on('debug', (...args) => void results.push(args));
      log.on('info', (...args) => void results.push(args));
      log.on('warn', (...args) => void results.push(args));
      log.on('error', (...args) => void results.push(args));
      callAllFuncs(log);
      expect(results).toStrictEqual([['debug'], ['info'], ['warn'], ['error']]);
    });

    test('info', () => {
      const log = new Logger({ console, level: 'info' });
      const results: unknown[][] = [];
      log.on('debug', (...args) => void results.push(args));
      log.on('info', (...args) => void results.push(args));
      log.on('warn', (...args) => void results.push(args));
      log.on('error', (...args) => void results.push(args));
      callAllFuncs(log);
      expect(results).toStrictEqual([['info'], ['warn'], ['error']]);
    });

    test('warn', () => {
      const log = new Logger({ console, level: 'warn' });
      const results: unknown[][] = [];
      log.on('debug', (...args) => void results.push(args));
      log.on('info', (...args) => void results.push(args));
      log.on('warn', (...args) => void results.push(args));
      log.on('error', (...args) => void results.push(args));
      callAllFuncs(log);
      expect(results).toStrictEqual([['warn'], ['error']]);
    });

    test('error', () => {
      const log = new Logger({ console, level: 'error' });
      const results: unknown[][] = [];
      log.on('debug', (...args) => void results.push(args));
      log.on('info', (...args) => void results.push(args));
      log.on('warn', (...args) => void results.push(args));
      log.on('error', (...args) => void results.push(args));
      callAllFuncs(log);
      expect(results).toStrictEqual([['error']]);
    });
  });

  describe('options', () => {
    test('color = true, timestamp = true', () => {
      callAllFuncs(new Logger({ console, color: true, timestamp: true }));
      // eslint-disable-next-line no-control-regex
      expect(results.error).toMatch(/^\u001B\[31m\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}] \[ERR]\u001B\[0m error$/);
    });

    test('color = false, timestamp = true', () => {
      callAllFuncs(new Logger({ console, color: false, timestamp: true }));
      expect(results.error).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}] \[ERR] error$/);
    });

    test('color = true, timestamp = false', () => {
      callAllFuncs(new Logger({ console, color: true, timestamp: false }));
      expect(results.error).toBe('\u001B[31m[ERR]\u001B[0m error');
    });

    test('color = false, timestamp = false', () => {
      callAllFuncs(new Logger({ console, color: false, timestamp: false }));
      expect(results.error).toBe('[ERR] error');
    });
  });

  describe('createChild', () => {
    test('shallow', () => {
      callAllFuncs(new Logger({ console, color: true, timestamp: false }).createChild('CHILD'));
      expect(results.error).toBe('\u001B[31m[ERR] [CHILD]\u001B[0m error');
    });

    test('deep', () => {
      callAllFuncs(
        new Logger({ console, color: true, timestamp: false })
          .createChild('C1')
          .createChild('C2')
          .createChild('C3')
          .createChild('C4'),
      );
      expect(results.error).toBe('\u001B[31m[ERR] [C1] [C2] [C3] [C4]\u001B[0m error');
    });

    test('inherit event', () => {
      const log1 = new Logger({ console });
      const results1: unknown[][] = [];
      log1.on('info', (...args) => void results1.push(args));
      const log2 = log1.createChild('');
      const results2: unknown[][] = [];
      log2.on('warn', (...args) => void results2.push(args));
      callAllFuncs(log1);
      callAllFuncs(log2);
      expect(results1).toStrictEqual([['info'], ['info']]);
      expect(results2).toStrictEqual([['warn']]);
    });
  });

  test('as handler', async () => {
    const log = new Logger();
    log.error = jest.fn();
    await new Promise((_, reject) => {
      reject(new Error('err'));
    }).catch(log.error);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  test('non-color console', () => {
    process.stdout.getColorDepth = jest.fn(() => 3);
    new Logger({ color: true, timestamp: true });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(process.stdout.getColorDepth).toHaveBeenCalledTimes(1);
  });

  test('debug() args are not processed if not debugging', () => {
    let dumped = false;
    const dump = (): void => void (dumped = true);
    const infoLog = new Logger({ console });
    infoLog.debug?.(dump());
    expect(dumped).toBe(false);
    const debugLog = new Logger({ console, level: 'debug' });
    debugLog.debug?.(dump());
    expect(dumped).toBe(true);
  });
});
