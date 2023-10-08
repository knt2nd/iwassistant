import { EventEmitter as Builtin } from 'node:events';

type EventListener = (...args: unknown[]) => void;

export abstract class EventEmitter<Events extends Record<string, unknown[]>> {
  readonly #error: ErrorHandler;
  readonly #emitter: Builtin;
  #prevErrorTime: number;
  #errorCount: number;

  constructor(errorHandler: ErrorHandler = () => {}) {
    this.#error = errorHandler;
    this.#emitter = new Builtin({ captureRejections: true });
    (this.#emitter as Builtin & Record<symbol, Function>)[Symbol.for('nodejs.rejection')] = this.#onError;
    this.#prevErrorTime = 0;
    this.#errorCount = 0;
  }

  #onError = (error: unknown): void => {
    const now = Date.now();
    if (now < this.#prevErrorTime + 500) {
      this.#errorCount++;
    } else {
      this.#errorCount = 1;
    }
    this.#prevErrorTime = now;
    if (this.#errorCount > 10) return;
    this.#error(error);
  };

  eventNames(): (keyof Events)[] {
    return this.#emitter.eventNames() as (keyof Events)[];
  }

  listeners<P extends keyof Events>(eventName: P): ((...args: Events[P]) => Awaitable<void>)[] {
    return this.#emitter.listeners(eventName as string) as ((...args: Events[P]) => Awaitable<void>)[];
  }

  on<P extends keyof Events>(eventName: P, listener: (...args: Events[P]) => Awaitable<void>): this {
    this.#emitter.on(eventName as string, listener as EventListener);
    return this;
  }

  once<P extends keyof Events>(eventName: P, listener: (...args: Events[P]) => Awaitable<void>): this {
    this.#emitter.once(eventName as string, listener as EventListener);
    return this;
  }

  off<P extends keyof Events>(eventName: P, listener: (...args: Events[P]) => Awaitable<void>): this {
    this.#emitter.off(eventName as string, listener as EventListener);
    return this;
  }

  removeAllListeners<P extends keyof Events>(eventName?: P): this {
    if (eventName === undefined) {
      this.#emitter.removeAllListeners();
    } else {
      this.#emitter.removeAllListeners(eventName as string);
    }
    return this;
  }

  emit<P extends keyof Events>(eventName: P, ...args: Events[P]): boolean {
    try {
      return this.#emitter.emit(eventName as string, ...args);
    } catch (error) {
      this.#onError(error);
      return true;
    }
  }
}
