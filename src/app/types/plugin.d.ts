type PluginOptions = {
  config?: BasicObject;
  command?: Record<string, { type: 'guild' | 'home'; options?: string }>;
  dict?: Record<string, { type: 'simple' | 'random'; options?: string }>;
  data?: Partial<Record<'app' | 'guild' | 'home', BasicObject>>;
};

type AppHandlers = Partial<import('../classes').AppInterface>;

type GuildHandlers<T extends PluginOptions = {}> = Partial<import('../classes').GuildAssistantInterface> &
  CommandHandlers<T, 'guild'>;

type HomeHandlers<T extends PluginOptions = {}> = Partial<import('../classes').HomeAssistantInterface> &
  CommandHandlers<T, 'home'>;

type CommandHandlers<T extends PluginOptions, U extends 'guild' | 'home'> = {
  [P in keyof T['command'] as T['command'][P] extends { type: U }
    ? P extends string
      ? `command${Capitalize<P>}`
      : never
    : never]: (
    event: CommandEvent<
      U,
      T['command'][P] extends { options: string } ? Record<T['command'][P]['options'], string> : {}
    >,
  ) => Awaitable<void | boolean>;
};

type SetupContext<T extends PluginOptions, U extends 'app' | 'guild' | 'home'> = {
  config: T['config'] extends object ? T['config'] : {};
  dict: SetupContextDictionary<T>;
  data: T['data'] extends object ? { [P in keyof T['data'][U]]?: T['data'][U][P] } : {};
  app: import('../classes').App;
} & (U extends 'app'
  ? {}
  : {
      assistant: U extends 'guild' ? import('../classes').GuildAssistant : import('../classes').HomeAssistant;
    });

type SetupContextDictionary<T extends PluginOptions> = Omit<import('../classes').I18nDictionary, 'get' | 'sub'> & {
  sub(locale: Locale): SetupContextDictionary<T>;
  get<P extends keyof T['dict']>(
    ...args: T['dict'][P] extends { options: string }
      ? [key: P, params: Record<T['dict'][P]['options'], Stringable>]
      : [key: P]
  ): string;
};

type IPlugin<T extends PluginOptions = {}> = { description: string } & Omit<AvailablePlugin<T>, 'data'> &
  (
    | {
        name: `general-${string}`;
        setupApp?(context: SetupContext<T, 'app'>): Awaitable<AppHandlers>;
        setupGuild(context: SetupContext<T, 'guild'>): Awaitable<GuildHandlers<T>>;
        setupHome(context: SetupContext<T, 'home'>): Awaitable<HomeHandlers<T>>;
      }
    | {
        name: `guild-${string}`;
        setupApp?(context: SetupContext<T, 'app'>): Awaitable<AppHandlers>;
        setupGuild(context: SetupContext<T, 'guild'>): Awaitable<GuildHandlers<T>>;
      }
    | {
        name: `home-${string}`;
        setupApp?(context: SetupContext<T, 'app'>): Awaitable<AppHandlers>;
        setupHome(context: SetupContext<T, 'home'>): Awaitable<HomeHandlers<T>>;
      }
    | {
        name: `app-${string}`;
        setupApp(context: SetupContext<T, 'app'>): Awaitable<AppHandlers>;
      }
  );

type AvailablePlugin<T extends PluginOptions = {}> = (T['data'] extends object
  ? {
      data: T['data'];
    }
  : {}) &
  (T['config'] extends object
    ? {
        config: T['config'];
      }
    : {}) &
  (T['command'] extends object
    ? 'guild' extends T['command'][keyof T['command']]['type']
      ? {
          permissions: {
            [P in keyof T['command'] as T['command'][P]['type'] extends 'guild'
              ? P
              : never]: import('discord.js').PermissionsString[];
          };
        }
      : {}
    : {}) &
  (T extends { command: object } | { dict: object }
    ? {
        i18n: I18n<
          (T['command'] extends object
            ? {
                command: {
                  [P in keyof T['command']]: { example: string } & (T['command'][P]['options'] extends string
                    ? {
                        description: [command: string, options: Record<T['command'][P]['options'], string>];
                        patterns: [pattern: string, options: Record<T['command'][P]['options'], number>][];
                      }
                    : {
                        description: string;
                        patterns: string[];
                      });
                };
              }
            : {}) &
            (T['dict'] extends object
              ? {
                  dict: {
                    [P in keyof T['dict']]: T['dict'][P]['type'] extends 'random' ? string[] : string;
                  };
                }
              : {})
        >;
      }
    : {});

interface AvailablePlugins {}
