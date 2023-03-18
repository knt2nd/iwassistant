import { isObject } from '../utils';

const DefaultDelay = 60_000;

enum Status {
  unready,
  preparing,
  ready,
  destroying,
  destroyed,
}

type ExtractPluginData<T extends Exclude<keyof PluginData, 'default'>> = {
  [P in keyof AvailablePlugins]: AvailablePlugins[P] extends { data: Record<T, object> }
    ? AvailablePlugins[P]['data'][T]
    : undefined;
};

type PluginData = {
  default: {};
  app: ExtractPluginData<'app'>;
  guild: ExtractPluginData<'guild'>;
  home: ExtractPluginData<'home'>;
};

export class Datastore<T extends keyof PluginData = 'default'> {
  readonly id: string;
  readonly props: BasicObject;
  readonly #subscribers: Map<string, ((value: BasicValue | undefined) => Awaitable<void>)[]>;
  #engine?: IStore;
  #error?: (type: string, error: unknown) => void;
  #timer?: NodeJS.Timeout;
  #changed: boolean;
  #status: Status;

  constructor(id: `${T}-${string}` | T) {
    this.id = id;
    this.props = {};
    this.#subscribers = new Map();
    this.#changed = false;
    this.#status = Status.unready;
  }

  async setup(engine: IStore, errorHandler: ErrorHandler): Promise<void> {
    if (this.#status !== Status.unready) return;
    this.#status = Status.preparing;
    this.#engine = engine;
    this.#error = (type, error) => errorHandler(new Error(`Datastore ${type}: ${this.id}`, { cause: error }));
    const data = await this.#engine.get(this.id);
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        this.props[key] = value;
      }
    }
    this.#status = Status.ready;
  }

  async destroy(): Promise<void> {
    if (this.#status !== Status.ready) return;
    this.#status = Status.destroying;
    clearTimeout(this.#timer);
    if (this.#engine && this.#changed) await this.#engine.set(this.id, this.props);
    this.#status = Status.destroyed;
  }

  get<U extends BasicValue = BasicValue, P extends string = string>(
    key: P,
  ): P extends keyof PluginData[T] ? Partial<PluginData[T][P]> | undefined : U | undefined {
    return this.props[key] as P extends keyof PluginData[T] ? Partial<PluginData[T][P]> | undefined : U | undefined;
  }

  set<P extends string>(
    key: P,
    value: P extends keyof PluginData[T] ? Partial<PluginData[T][P]> : BasicValue,
    delay?: number,
  ): boolean {
    this.props[key] = value as BasicValue;
    this.#changed = true;
    this.#publish(key, value as BasicValue);
    return this.save(delay);
  }

  delete(key: string, delay?: number): boolean {
    delete this.props[key];
    this.#changed = true;
    this.#publish(key);
    return this.save(delay);
  }

  save(delay?: number): boolean {
    if (this.#status !== Status.ready) return false;
    if (!this.#engine || delay === Number.POSITIVE_INFINITY) return true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (!this.#changed) return;
      this.#engine
        ?.set(this.id, this.props)
        .then(() => (this.#changed = false))
        .catch((error) => this.#error?.('save', error));
    }, delay ?? DefaultDelay);
    return true;
  }

  createProperty<U extends BasicObject = BasicObject, P extends string = string>(
    key: P,
  ): P extends keyof PluginData[T] ? Partial<PluginData[T][P]> : U {
    return new DatastoreProperty(key, this as Storable) as P extends keyof PluginData[T]
      ? Partial<PluginData[T][P]>
      : U;
  }

  subscribe<P extends string>(
    key: P,
    subscriber: (
      value: (P extends keyof PluginData[T] ? Partial<PluginData[T][P]> : BasicValue) | undefined,
    ) => Awaitable<void>,
  ): void {
    let subscribers = this.#subscribers.get(key);
    if (!subscribers) this.#subscribers.set(key, (subscribers = []));
    subscribers.push(subscriber as (value: BasicValue | undefined) => Awaitable<void>);
  }

  unsubscribe(key: string): boolean {
    return this.#subscribers.delete(key);
  }

  #publish(key: string, value?: BasicValue): void {
    const subscribers = this.#subscribers.get(key);
    if (!subscribers) return;
    for (const subscriber of subscribers) {
      try {
        const res = subscriber(value);
        if (res instanceof Promise) res.catch((error) => this.#error?.('publish', error));
      } catch (error) {
        this.#error?.('publish', error);
      }
    }
  }
}

function isProperty(target: unknown): target is Record<string, BasicValue> {
  return isObject(target);
}

type Storable = {
  get(key: string): BasicValue | undefined;
  set(key: string, value: BasicValue, delay?: number): boolean;
};

class DatastoreProperty {
  constructor(key: string, store: Storable) {
    return new Proxy(this, {
      get: (_target, p: string): BasicValue | undefined => {
        const data = store.get(key);
        return isProperty(data) ? data[p] : undefined;
      },
      set: (_target, p: string, value: BasicValue): boolean => {
        let data = store.get(key) ?? {};
        if (!isProperty(data)) data = {}; // overwrite forcibly
        data[p] = value;
        return store.set(key, data, p.startsWith('_') ? Number.POSITIVE_INFINITY : undefined);
      },
      deleteProperty: (_target, p: string): boolean => {
        const data = store.get(key);
        if (!isProperty(data)) return true;
        delete data[p];
        return store.set(key, data, p.startsWith('_') ? Number.POSITIVE_INFINITY : undefined);
      },
    });
  }
}
