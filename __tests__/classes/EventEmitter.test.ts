import { EventEmitter } from '../../src/app/classes';
import { sleep } from '../../src/app/utils';

class EE extends EventEmitter<Record<string, unknown[]>> {}

const dummy: Record<'a' | 'b', (...args: unknown[]) => void> = {
  a() {},
  b() {},
};

describe('EventEmitter', () => {
  test('eventNames', () => {
    const ee = new EE();
    ee.on('a', dummy.a);
    expect(ee.eventNames()).toEqual(['a']);
    ee.on('b', dummy.b);
    expect(ee.eventNames()).toEqual(['a', 'b']);
  });

  test('on', () => {
    const ee = new EE();
    ee.on('a', dummy.a);
    expect(ee.emit('a')).toBe(true);
    expect(ee.emit('b')).toBe(false);
    expect(ee.emit('error')).toBe(true); // my custom EE always has its default error handler
  });

  test('off', () => {
    const ee = new EE();
    let counter = 0;
    const countUp = (): void => {
      counter++;
    };
    ee.on('a', countUp);
    ee.emit('a');
    expect(counter).toBe(1);
    ee.off('a', dummy.a);
    ee.emit('a');
    expect(counter).toBe(2);
    ee.off('a', countUp);
    ee.emit('a');
    expect(counter).toBe(2);
  });

  test('once', () => {
    const ee = new EE();
    let counter = 0;
    ee.once('a', () => {
      counter++;
    });
    ee.emit('a');
    expect(counter).toBe(1);
    ee.emit('a');
    expect(counter).toBe(1);
  });

  test('removeAllListeners', () => {
    const ee = new EE();
    const counter = { a: 0, b: 0, c: 0 };
    ee.on('a', () => {
      counter.a++;
    })
      .on('b', () => {
        counter.b++;
      })
      .on('c', () => {
        counter.c++;
      });
    ee.emit('a');
    ee.emit('b');
    ee.emit('c');
    expect(counter).toEqual({ a: 1, b: 1, c: 1 });
    ee.removeAllListeners('a');
    ee.emit('a');
    ee.emit('b');
    ee.emit('c');
    expect(counter).toEqual({ a: 1, b: 2, c: 2 });
    ee.removeAllListeners();
    ee.emit('a');
    ee.emit('b');
    ee.emit('c');
    expect(counter).toEqual({ a: 1, b: 2, c: 2 });
  });

  test('emit', async () => {
    let results: [string, unknown[]][] = [];
    const ee = new EE();
    ee.on('sync 1', (...args) => {
      results.push(['sync 1-1', args]);
    })
      .on('sync 1', (...args) => {
        results.push(['sync 1-2', args]);
      })
      .on('sync 2', (...args) => {
        results.push(['sync 2-1', args]);
      })
      .on('sync 2', (...args) => {
        results.push(['sync 2-2', args]);
      })
      .on('async 1', async (...args) => {
        await sleep(10);
        results.push(['async 1-1', args]);
      })
      .on('async 1', async (...args) => {
        await sleep(20);
        results.push(['async 1-2', args]);
      })
      .on('async 2', async (...args) => {
        await sleep(10);
        results.push(['async 2-1', args]);
      })
      .on('async 2', async (...args) => {
        await sleep(20);
        results.push(['async 2-2', args]);
      });
    ee.emit('sync 1', 1, 'str', true, {}, [], undefined, null, ee);
    ee.emit('sync 1', 2);
    ee.emit('sync 2', 3);
    ee.emit('sync 2', 4);
    ee.emit('async 1', 5, 'str', true, {}, [], undefined, null, ee);
    ee.emit('async 1', 6);
    ee.emit('async 2', 7);
    ee.emit('async 2', 8);
    ee.emit('no event', 9);
    expect(results).toStrictEqual([
      ['sync 1-1', [1, 'str', true, {}, [], undefined, null, ee]],
      ['sync 1-2', [1, 'str', true, {}, [], undefined, null, ee]],
      ['sync 1-1', [2]],
      ['sync 1-2', [2]],
      ['sync 2-1', [3]],
      ['sync 2-2', [3]],
      ['sync 2-1', [4]],
      ['sync 2-2', [4]],
    ]);
    results = [];
    await sleep(10);
    expect(results).toStrictEqual([
      ['async 1-1', [5, 'str', true, {}, [], undefined, null, ee]],
      ['async 1-1', [6]],
      ['async 2-1', [7]],
      ['async 2-1', [8]],
    ]);
    results = [];
    await sleep(10);
    expect(results).toStrictEqual([
      ['async 1-2', [5, 'str', true, {}, [], undefined, null, ee]],
      ['async 1-2', [6]],
      ['async 2-2', [7]],
      ['async 2-2', [8]],
    ]);
  });

  test('emit error event', () => {
    const counter = { onError: 0, emit: 0 };
    const ee = new EE(() => {
      counter.onError++;
    });
    // https://nodejs.org/api/events.html#error-events
    ee.emit('error', new Error('whoops!'));
    expect(counter).toEqual({ onError: 1, emit: 0 });
    ee.on('error', () => {
      counter.emit++;
    });
    ee.emit('error', new Error('whoops!'));
    expect(counter).toEqual({ onError: 1, emit: 1 });
  });

  test('emit error', async () => {
    let results: [string, unknown[]][] = [];
    let errors: unknown[] = [];
    const ee = new EE((error) => errors.push(error));
    ee.on('sync 1', (...args) => {
      results.push(['sync 1-1', args]);
    })
      .on('sync 1', (...args) => {
        throw new Error(`sync 1-2 ${args as unknown as string}`);
      })
      .on('sync 2', (...args) => {
        results.push(['sync 2-1', args]);
      })
      .on('sync 2', (...args) => {
        throw new Error(`sync 2-2 ${args as unknown as string}`);
      })
      .on('async 1', async (...args) => {
        await sleep(10);
        results.push(['async 1-1', args]);
      })
      .on('async 1', async (...args) => {
        await sleep(10);
        return Promise.reject(new Error(`async 1-2 ${args as unknown as string}`));
      })
      .on('async 2', async (...args) => {
        await sleep(10);
        results.push(['async 2-1', args]);
      })
      .on('async 2', async (...args) => {
        await sleep(20);
        return Promise.reject(new Error(`async 2-2 ${args as unknown as string}`));
      });
    ee.emit('sync 1', 1, 'str', true, {}, [], undefined, null, ee);
    ee.emit('sync 1', 2);
    ee.emit('sync 2', 3);
    ee.emit('sync 2', 4);
    ee.emit('async 1', 5, 'str', true, {}, [], undefined, null, ee);
    ee.emit('async 1', 6);
    ee.emit('async 2', 7);
    ee.emit('async 2', 8);
    ee.emit('no event', 9);
    expect(results).toStrictEqual([
      ['sync 1-1', [1, 'str', true, {}, [], undefined, null, ee]],
      ['sync 1-1', [2]],
      ['sync 2-1', [3]],
      ['sync 2-1', [4]],
    ]);
    expect(errors).toStrictEqual([
      new Error('sync 1-2 1,str,true,[object Object],,,,[object Object]'),
      new Error('sync 1-2 2'),
      new Error('sync 2-2 3'),
      new Error('sync 2-2 4'),
    ]);
    results = [];
    errors = [];
    await sleep(10);
    expect(results).toStrictEqual([
      ['async 1-1', [5, 'str', true, {}, [], undefined, null, ee]],
      ['async 1-1', [6]],
      ['async 2-1', [7]],
      ['async 2-1', [8]],
    ]);
    expect(errors).toStrictEqual([
      new Error('async 1-2 5,str,true,[object Object],,,,[object Object]'),
      new Error('async 1-2 6'),
    ]);
    results = [];
    errors = [];
    await sleep(20);
    expect(results).toStrictEqual([]);
    expect(errors).toStrictEqual([new Error('async 2-2 7'), new Error('async 2-2 8')]);
  });

  test('emit error, without handler', async () => {
    let results: string[] = [];
    const ee = new EE();
    ee.on('sync', () => {
      results.push('sync');
    })
      .on('sync', () => {
        throw new Error('sync');
      })
      .on('async', async () => {
        await sleep(10);
        results.push('async');
      })
      .on('async', async () => {
        return Promise.reject(new Error('async'));
      });
    ee.emit('sync');
    ee.emit('sync');
    ee.emit('async');
    ee.emit('async');
    expect(results).toStrictEqual(['sync', 'sync']);
    results = [];
    await sleep(10);
    expect(results).toStrictEqual(['async', 'async']);
  });

  test('onError, sync infinite loop', async () => {
    let errorCounter = 0;
    const ee = new EE(() => {
      ee.emit('sync');
      errorCounter++;
    });
    ee.on('sync', () => {
      throw new Error('sync');
    });
    ee.emit('sync');
    expect(errorCounter).toBe(10);
    errorCounter = 0;
    ee.emit('sync');
    await sleep(10);
    expect(errorCounter).toBe(0);
    await sleep(500);
    ee.emit('sync');
    expect(errorCounter).toBe(10);
  });

  test('onError, async infinite loop', async () => {
    let errorCounter = 0;
    const ee = new EE(() => {
      ee.emit('async');
      errorCounter++;
    });
    ee.on('async', async () => {
      await sleep(1);
      return Promise.reject(new Error('async'));
    });
    ee.emit('async');
    expect(errorCounter).toBe(0);
    await sleep(10);
    expect(errorCounter).toBeGreaterThan(0);
    expect(errorCounter).toBeLessThan(10);
    await sleep(200);
    expect(errorCounter).toBe(10);
    errorCounter = 0;
    ee.emit('async');
    await sleep(50);
    expect(errorCounter).toBe(0);
    await sleep(500);
    ee.emit('async');
    await sleep(50);
    expect(errorCounter).toBeGreaterThan(0);
  });
});
