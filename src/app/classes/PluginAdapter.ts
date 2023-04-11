import { toKebabCase, uncapitalize } from '../utils';
import type { App } from './App';
import { EventEmitter } from './EventEmitter';
import type { GuildAssistant } from './GuildAssistant';
import type { HomeAssistant } from './HomeAssistant';
import { I18nDictionary } from './I18nDictionary';
import type { AdaptablePlugin, PluginContextOptions, PluginManager } from './PluginManager';

function extractNonUnique(commands: AttachedCommand[]): AttachedCommand[] {
  return commands.filter((c1, i) => commands.some((c2, j) => i !== j && c1.id === c2.id));
}

function toAttachedPlugin(plugin: AdaptablePlugin): AttachedPlugin {
  const { name, description, config, permissions, i18n } = plugin;
  return { name, description, config, permissions, i18n };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any) => Awaitable<void>;

type Events<T extends PluginInterface> = {
  [P in keyof T as P extends `on${infer U}` ? Uncapitalize<U> : never]: Parameters<T[P]>;
};

type Hooks<T extends PluginInterface> = {
  [P in keyof T as P extends `before${infer U}` ? Uncapitalize<U> : never]: Parameters<T[P]>;
};

export type AttachedPlugin = Omit<AdaptablePlugin, `setup${string}`>;

export type AttachedCommand = {
  id: string;
  name: string;
  plugin: AttachedPlugin;
  execute: (event: CommandEvent) => Awaitable<void | boolean>;
};

export type PluginInterface = Record<string, Handler>;

export abstract class PluginAdapter<T extends PluginInterface> extends EventEmitter<Events<T>> {
  abstract readonly locale: Locale;
  readonly dicts: Map<string, I18nDictionary> = new Map();
  readonly attachments: Map<string, AttachedPlugin> = new Map();
  readonly commands: Map<string, AttachedCommand> = new Map();
  readonly #hooks: Map<keyof Hooks<T>, Handler[]> = new Map();

  protected async attach(
    resource: PluginManager,
    options: { app: App; optionsList?: PluginContextOptions[] } & (
      | { type: 'app' }
      | { type: 'guild'; assistant: GuildAssistant }
      | { type: 'home'; assistant: HomeAssistant }
    ),
  ): Promise<Record<'events' | 'hooks' | 'commands', string[]>> {
    const plugins = resource.createContext(options.optionsList);
    const promises: Promise<{ plugin: AdaptablePlugin; setup?: Record<string, Handler> }>[] = [];
    for (const plugin of plugins) {
      const dict = new I18nDictionary(
        this.locale,
        Object.fromEntries(Object.entries(plugin.i18n).map(([locale, value]) => [locale, value.dict ?? {}])),
      );
      const opts = { dict, config: plugin.config, app: options.app };
      this.dicts.set(plugin.name, dict);
      promises.push(
        (async () => {
          switch (options.type) {
            case 'app': {
              if (plugin.setupApp) {
                const data = options.app.data.createProperty(plugin.name);
                return { plugin, setup: await plugin.setupApp({ ...opts, data }) };
              }
              break;
            }
            case 'guild': {
              if (plugin.setupGuild) {
                const data = options.assistant.data.createProperty(plugin.name);
                return { plugin, setup: await plugin.setupGuild({ ...opts, data, assistant: options.assistant }) };
              }
              break;
            }
            case 'home': {
              if (plugin.setupHome) {
                const data = options.assistant.data.createProperty(plugin.name);
                return { plugin, setup: await plugin.setupHome({ ...opts, data, assistant: options.assistant }) };
              }
              break;
            }
          }
          return { plugin };
        })(),
      );
    }
    const commands: AttachedCommand[] = [];
    for (const result of await Promise.all(promises)) {
      if (!result.setup) continue;
      const plugin = toAttachedPlugin(result.plugin);
      for (const [key, execute] of Object.entries(result.setup)) {
        if (!(execute instanceof Function)) continue; // just in case
        const matched = key.match(/^(on|before|command)([A-Z]\w+)$/);
        if (!matched || matched[1] === undefined || matched[2] === undefined) continue;
        const type = matched[1];
        const name = uncapitalize(matched[2]);
        switch (type) {
          case 'on': {
            this.on(name as keyof Events<T>, execute);
            break;
          }
          case 'before': {
            let hooks = this.#hooks.get(name as keyof Hooks<T>);
            if (!hooks) this.#hooks.set(name as keyof Hooks<T>, (hooks = []));
            hooks.push(execute);
            break;
          }
          case 'command': {
            commands.push({ id: toKebabCase(name), name, plugin, execute });
            break;
          }
        }
      }
    }
    for (const command of extractNonUnique(commands).filter((c) => c.name !== c.plugin.name.replace(/^\w+-/, ''))) {
      command.id = `${toKebabCase(command.plugin.name.replace(/^[a-z]+-/, ''))}-${command.id}`;
    }
    for (const command of extractNonUnique(commands).filter((c) => c.plugin.name.startsWith('general-'))) {
      command.id = `general-${command.id}`; // any better way? :thinking:
    }
    for (const command of commands) {
      this.commands.set(command.id, command);
    }
    for (const plugin of plugins) {
      this.attachments.set(plugin.name, toAttachedPlugin(plugin));
    }
    return {
      events: (this.eventNames() as string[]).sort(),
      hooks: [...this.#hooks.keys()].sort() as string[],
      commands: [...this.commands].map(([id, { plugin }]) => `${plugin.name}:${id}`),
    };
  }

  async hook<P extends keyof Hooks<T>>(
    hookName: P,
    ...args: Hooks<T>[P] extends unknown[] ? Hooks<T>[P] : never
  ): Promise<void> {
    const hooks = this.#hooks.get(hookName);
    if (!hooks) return;
    for (const hook of hooks) {
      await hook(...args);
    }
  }
}
