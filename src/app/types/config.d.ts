type ConfigValueType = string | number | boolean;

type SelectOption<T extends ConfigValueType = string> = {
  label: string;
  value: T;
};

type ConfigField<T extends ConfigValueType = ConfigValueType> = {
  name: string;
  options: SelectOption<T>[];
  value: T;
  disabled?: boolean;
  order?: number;
  update: (value: T, interaction: import('discord.js').StringSelectMenuInteraction) => Awaitable<void | boolean>;
};

type ConfigureContext<T extends Record<string, unknown> = {}> = T & {
  fields: Omit<ConfigField[], 'push'> & { push<T extends ConfigValueType>(field: ConfigField<T>): number };
  locale: Locale;
  member: import('discord.js').GuildMember;
};

type VoiceConfig<T extends 'tts' | undefined = undefined> = {
  engine: string;
  locale: Locale;
  voice: string;
} & (T extends 'tts'
  ? {
      speed: number;
      pitch: number;
    }
  : {});
