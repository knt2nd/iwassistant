import type { ClientEvents, PermissionsString } from 'discord.js';
import { Events } from 'discord.js';
import { capitalize, uncapitalize } from '../utils';
import type { App } from './App';
import type { DiscordEventNames } from './DiscordManager';
import type { GuildAssistant } from './GuildAssistant';
import type { HomeAssistant } from './HomeAssistant';
import type { I18nDictionary } from './I18nDictionary';
import type { ModuleLoader, ModuleReport } from './ModuleLoader';

enum Status {
  unready,
  preparing,
  ready,
}

type SetupReport = { modules: ModuleReport; events: DiscordEventNames };

type PluginSetupContext = {
  data: BasicObject;
  config: BasicObject;
  dict: I18nDictionary;
  app: App;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PluginSetupResult = Awaitable<Record<string, (...args: any) => Awaitable<void>>>;

export type AdaptablePlugin = {
  name: string;
  description: string;
  config: BasicObject;
  permissions: Record<string, PermissionsString[]>;
  i18n: I18n<{
    command?: Record<
      string,
      { example: string } & (
        | { description: string; patterns: string[] }
        | {
            description: [command: string, options: Record<string, string>];
            patterns: [pattern: string, options: Record<string, number>][];
          }
      )
    >;
    dict?: Record<string, string | string[]>;
  }>;
  setupApp?(context: PluginSetupContext): PluginSetupResult;
  setupGuild?(context: PluginSetupContext & { assistant: GuildAssistant }): PluginSetupResult;
  setupHome?(context: PluginSetupContext & { assistant: HomeAssistant }): PluginSetupResult;
};

export type PluginContextOptions<T extends boolean = boolean> = {
  [P in keyof AvailablePlugins]?: AvailablePlugins[P] extends
    | { config: object }
    | { permissions: object }
    | { i18n: object }
    ?
        | T
        | ((AvailablePlugins[P] extends { config: object } ? { config?: Partial<AvailablePlugins[P]['config']> } : {}) &
            (AvailablePlugins[P] extends { permissions: object }
              ? { permissions?: Partial<AvailablePlugins[P]['permissions']> }
              : {}) &
            (AvailablePlugins[P] extends { i18n: object } ? { i18n?: Partial<AvailablePlugins[P]['i18n']> } : {}))
    : T;
};

export type PluginManagerOptions = PluginContextOptions<true>;

export class PluginManager {
  readonly #options: PluginManagerOptions;
  readonly #loader: ModuleLoader<IPlugin, AdaptablePlugin>;
  #status: Status;

  constructor(options: PluginManagerOptions, loader: ModuleLoader) {
    this.#options = options;
    this.#loader = loader as ModuleLoader<IPlugin, AdaptablePlugin>;
    this.#status = Status.unready;
  }

  get #discordEventNames(): DiscordEventNames {
    const allNames = new Set<string>(Object.values(Events));
    const result = { app: new Set<string>(), guild: new Set<string>() };
    for (const key of Object.keys(this.#options)) {
      const plugin = this.#loader.get(key);
      if (!plugin) continue;
      for (const [adapter, names] of Object.entries(result)) {
        const setup = (plugin as Record<string, unknown>)[`setup${capitalize(adapter)}`];
        if (!(setup instanceof Function)) continue;
        const matched = setup
          .toString() // it's not perfect but okay in most of cases
          .replaceAll(/(\/\/.*|'.*?'|".*?")/g, '')
          .replaceAll(/(\/\*.*\*\/|`.*?`)/gs, '')
          .matchAll(/on([A-Z][a-z]+[A-Z][A-Za-z]+)/g);
        const filtered = [...matched].map(([, name]) => uncapitalize(name!)).filter((name) => allNames.has(name));
        for (const name of filtered) {
          names.add(name);
        }
      }
    }
    return {
      app: [...result.app] as (keyof ClientEvents)[],
      guild: [...result.guild] as (keyof ClientEvents)[],
    };
  }

  get #report(): SetupReport {
    return { modules: this.#loader.createReport(this.#options), events: this.#discordEventNames };
  }

  async setup(): Promise<SetupReport> {
    if (this.#status !== Status.unready) return this.#report;
    this.#status = Status.preparing;
    await this.#loader.load((source) => ({
      config: {},
      permissions: {},
      i18n: {},
      ...source, // might have extra properties at runtime and overwrite those empty objects
    }));
    this.#status = Status.ready;
    return this.#report;
  }

  get(name: string): AdaptablePlugin | undefined {
    return this.#loader.get(name);
  }

  createContext(optionsList: PluginContextOptions[] = []): AdaptablePlugin[] {
    if (this.#status !== Status.ready) return [];
    const plugins: AdaptablePlugin[] = [];
    let names = Object.keys(this.#options);
    for (const options of optionsList) {
      for (const [k, v] of Object.entries(options)) {
        if (v === false) names = names.filter((n) => n !== k);
      }
    }
    optionsList.unshift(this.#options);
    for (const name of names) {
      const plugin = this.#loader.get(name);
      if (!plugin) continue;
      const options = {
        config: { ...plugin.config },
        permissions: { ...plugin.permissions },
        i18n: { ...plugin.i18n },
      };
      for (const all of optionsList) {
        const user = (all as Record<string, Partial<typeof options>>)[name];
        if (!user) continue;
        if (user.config) options.config = { ...options.config, ...user.config };
        if (user.permissions) options.permissions = { ...options.permissions, ...user.permissions };
        if (user.i18n) options.i18n = { ...options.i18n, ...user.i18n };
      }
      plugins.push({ ...plugin, ...structuredClone(options) });
    }
    return plugins;
  }
}
