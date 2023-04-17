import { createAudioPlayer, createAudioResource, entersState, joinVoiceChannel } from '@discordjs/voice';
import type { Guild } from 'discord.js';
import { shortenId } from '../utils';
import type { App } from './App';
import type { AssistantOptions } from './Assistant';
import { Datastore } from './Datastore';
import type { GuildAssistantOptions } from './GuildAssistant';
import { GuildAssistant } from './GuildAssistant';
import { GuildAudioReceiver } from './GuildAudioReceiver';
import { GuildVoiceChannel } from './GuildVoiceChannel';
import type { PluginContextOptions } from './PluginManager';

enum Status {
  ready,
  destroying,
  destroyed,
}

type GuildAssistantAdditionalOptions = {
  /**
   * Plugin settings for each guild
   */
  plugins: PluginContextOptions;
};

export type GuildAssistantManagerOptions = {
  /**
   * Default guild settings
   */
  default?: Partial<GuildAssistantOptions & GuildAssistantAdditionalOptions>;
  /**
   * Specific guild settings
   */
  [id: string]: Partial<GuildAssistantOptions & GuildAssistantAdditionalOptions>;
};

export class GuildAssistantManager {
  readonly #locale: Locale;
  readonly #options: GuildAssistantManagerOptions | undefined;
  readonly #assistantOptions: AssistantOptions | undefined;
  readonly #assistants: Map<string, GuildAssistant>;
  #status: Status;

  constructor(
    locale: Locale,
    options: GuildAssistantManagerOptions | undefined,
    assistantOptions: AssistantOptions | undefined,
  ) {
    this.#locale = locale;
    this.#options = options;
    this.#assistantOptions = assistantOptions;
    this.#assistants = new Map();
    this.#status = Status.ready;
  }

  async destroy(): Promise<void> {
    if (this.#status !== Status.ready) return;
    this.#status = Status.destroying;
    // each assistant handles its own error by itself
    await Promise.all([...this.#assistants.values()].map(async (assistant) => assistant.destroy().catch()));
    this.#status = Status.destroyed;
  }

  get(guildId: string): GuildAssistant | undefined {
    return this.#assistants.get(guildId);
  }

  async add(app: App, guild: Guild, options?: Partial<GuildAssistantOptions>): Promise<boolean> {
    if (this.#status !== Status.ready || this.#assistants.has(guild.id)) return false;
    const log = app.log.createChild(`GUILD:${shortenId(guild.id)}`);
    const assistant = new GuildAssistant(
      guild.members.me ?? (await guild.members.fetch(guild.client.user.id)),
      guild,
      {
        locale: options?.locale ?? this.#options?.[guild.id]?.locale ?? this.#options?.default?.locale ?? this.#locale,
        slash: options?.slash ?? this.#options?.[guild.id]?.slash ?? this.#options?.default?.slash ?? true,
      },
      this.#assistantOptions ? structuredClone(this.#assistantOptions) : {},
      {
        data: new Datastore(`guild-${guild.id}`),
        log,
        engines: app.engines,
        voiceChannel: new GuildVoiceChannel(
          {
            debug: !!log.debug,
            guildId: guild.id,
          },
          {
            adapterCreator: guild.voiceAdapterCreator,
            createAudioPlayer,
            createAudioResource,
            joinVoiceChannel,
            entersState,
          },
        ),
        audioReceiver: new GuildAudioReceiver(log.error, !!log.debug),
      },
    );
    const optionsList: PluginContextOptions[] = [];
    const defaultOptions = this.#options?.default?.plugins;
    const guildOptions = this.#options?.[guild.id]?.plugins;
    if (defaultOptions) optionsList.push(defaultOptions);
    if (guildOptions) optionsList.push(guildOptions);
    await assistant.setup(app, optionsList);
    this.#assistants.set(guild.id, assistant);
    return true;
  }

  async remove(guildId: string): Promise<boolean> {
    if (this.#status !== Status.ready) return false;
    const assistant = this.#assistants.get(guildId);
    if (!assistant) return false;
    await assistant.destroy();
    this.#assistants.delete(guildId);
    return true;
  }
}
