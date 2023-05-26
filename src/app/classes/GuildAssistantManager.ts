import { createAudioPlayer, createAudioResource, entersState, joinVoiceChannel } from '@discordjs/voice';
import type { Guild } from 'discord.js';
import { shortenId } from '../utils';
import type { App } from './App';
import type { AssistantOptions } from './Assistant';
import { Datastore } from './Datastore';
import { GuildAssistant } from './GuildAssistant';
import { GuildAudioReceiver } from './GuildAudioReceiver';
import { GuildVoiceChannel } from './GuildVoiceChannel';
import type { PluginContextOptions } from './PluginManager';

enum Status {
  ready,
  destroying,
  destroyed,
}

type GuildAssistantOptions = {
  /**
   * Guild locale
   */
  locale?: Locale;
  /**
   * Guild assistant settings
   */
  assistant?: AssistantOptions;
  /**
   * Guild plugin settings
   */
  plugins?: PluginContextOptions;
};

export type GuildAssistantMangerOptions = {
  /**
   * Default locale
   */
  locale: Locale;
  /**
   * Assistant default settings
   */
  assistant?: AssistantOptions;
  /**
   * Each guild settings
   */
  guilds?: {
    /**
     * Default guild settings
     */
    default?: GuildAssistantOptions;
    /**
     * Specific guild settings
     */
    [id: string]: GuildAssistantOptions;
  };
};

export class GuildAssistantManager {
  readonly #options: GuildAssistantMangerOptions;
  readonly #assistants: Map<string, GuildAssistant>;
  #status: Status;

  constructor(options: GuildAssistantMangerOptions) {
    this.#options = options;
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

  async add(app: App, guild: Guild): Promise<boolean> {
    if (this.#status !== Status.ready || this.#assistants.has(guild.id)) return false;
    const log = app.log.createChild(`GUILD:${shortenId(guild.id)}`);
    const assistant = new GuildAssistant(
      {
        locale:
          this.#options.guilds?.[guild.id]?.locale ?? this.#options.guilds?.default?.locale ?? this.#options.locale,
        ...(this.#options.guilds?.[guild.id]?.assistant ??
          this.#options.guilds?.default?.assistant ??
          this.#options.assistant),
      },
      {
        member: guild.members.me ?? (await guild.members.fetch(guild.client.user.id)),
        guild,
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
    const defaultOptions = this.#options.guilds?.default?.plugins;
    const guildOptions = this.#options.guilds?.[guild.id]?.plugins;
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
