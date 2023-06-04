import { generateDependencyReport } from '@discordjs/voice';
import type {
  ActivityOptions,
  Client,
  ClientEvents,
  DMChannel,
  GatewayIntentsString,
  Interaction,
  Message,
  NonThreadGuildBasedChannel,
} from 'discord.js';
import { ActivityType, IntentsBitField, Partials } from 'discord.js';
import { sleep } from '../utils';
import type { App } from './App';
import type { GuildAssistantManager } from './GuildAssistantManager';
import type { Logger } from './Logger';

// https://discord-api-types.dev/api/discord-api-types-v10/enum/GatewayIntentBits
const IntentRequirements: Record<
  Exclude<GatewayIntentsString, 'GuildBans'>,
  [adapter: 'app' | 'guild', pattern: RegExp][] | undefined
> = {
  AutoModerationConfiguration: undefined,
  AutoModerationExecution: undefined,
  DirectMessageReactions: [['app', /^messageReaction/]],
  DirectMessageTyping: [['app', /^typing/]],
  DirectMessages: [['app', /^(message|channel)[^R]/]],
  GuildEmojisAndStickers: [['guild', /^(emoji|sticker)/]],
  GuildIntegrations: [['guild', /^guildIntegration/]],
  GuildInvites: [['guild', /^invite/]],
  GuildMembers: undefined,
  GuildMessageReactions: [['guild', /^messageReaction/]],
  GuildMessageTyping: [['guild', /^typing/]],
  GuildMessages: undefined,
  GuildModeration: [['guild', /^guildBan/]],
  GuildPresences: [['guild', /^presence/]],
  GuildScheduledEvents: [['guild', /^guildScheduledEvent/]],
  GuildVoiceStates: undefined,
  GuildWebhooks: [['guild', /^webhook/]],
  Guilds: undefined,
  MessageContent: undefined,
};

const DefaultIntentNames: GatewayIntentsString[] = [
  'Guilds',
  'GuildMembers',
  'GuildMessages',
  'GuildVoiceStates',
  'MessageContent',
];

const DefaultEventNames: (keyof ClientEvents)[] = [
  'warn',
  'error',
  'invalidated',
  'shardReady',
  'shardDisconnect',
  // 'shardReconnecting',
  // 'shardResume',
  'shardError',
  'guildCreate',
  'guildDelete',
  'messageCreate',
  'interactionCreate',
];

const DebugEventNames: (keyof ClientEvents)[] = ['cacheSweep', 'debug'];

enum Status {
  unready,
  preparing,
  ready,
  destroying,
  destroyed,
}

export type DiscordEventNames = { app: (keyof ClientEvents)[]; guild: (keyof ClientEvents)[] };

export type DiscordManagerOptions = {
  /**
   * Token of the account to log in with
   * @default `process.env.DISCORD_TOKEN`
   * @see https://discordjs.guide/preparations/setting-up-a-bot-application.html
   */
  token?: string;
  /**
   * Activity the client user is playing
   * @see https://discord.js.org/#/docs/discord.js/main/typedef/ActivityOptions
   */
  activity?: {
    /**
     * Name of the activity
     */
    name: string;
    /**
     * Type of the activity
     * @default "Playing"
     * @see https://discord-api-types.dev/api/discord-api-types-v10/enum/ActivityType
     */
    type?: Exclude<keyof typeof ActivityType, 'Custom'>;
    /**
     * Twitch / YouTube stream URL
     */
    url?: string;
  };
};

export class DiscordManager<Ready extends boolean = boolean> {
  readonly client: Client<Ready>;
  readonly assistants: GuildAssistantManager;
  readonly #options: DiscordManagerOptions | undefined;
  readonly #intentNames: Set<GatewayIntentsString>;
  readonly #eventNames: Set<keyof ClientEvents>;
  #status: Status;

  constructor(options: DiscordManagerOptions | undefined, di: { client: Client; assistants: GuildAssistantManager }) {
    this.client = di.client;
    this.assistants = di.assistants;
    this.#options = options;
    this.#intentNames = new Set(DefaultIntentNames);
    this.#eventNames = new Set(DefaultEventNames);
    this.#status = Status.unready;
  }

  async setup(app: App, eventNames: DiscordEventNames): Promise<void> {
    if (this.#status !== Status.unready || !this.#options) return;
    this.#status = Status.preparing;
    const log = app.log.createChild('DISCORD');
    if (log.debug) {
      for (const name of DebugEventNames) {
        this.#eventNames.add(name);
      }
    }
    for (const name of Object.values(eventNames).flat()) {
      this.#eventNames.add(name);
    }
    for (const [intent, events] of Object.entries(IntentRequirements)) {
      if (!events) continue;
      for (const [adapter, pattern] of events) {
        if (!eventNames[adapter].some((name) => name.match(pattern))) continue;
        this.#intentNames.add(intent as GatewayIntentsString);
      }
    }
    // https://discordjs.guide/popular-topics/partials.html
    this.client.options.partials = Object.values(Partials).filter((value) => typeof value === 'number') as Partials[];
    this.client.options.intents = new IntentsBitField([...this.#intentNames]);
    this.#initializeEvents(app, log);
    log.debug?.('Dependencies:', generateDependencyReport());
    log.debug?.('Intents:', [...this.#intentNames].sort());
    log.debug?.('Events:', [...this.#eventNames].sort());
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', (client) => {
        log.info(`Logged in as ${client.user.id} ${client.user.tag}`);
        Promise.all(client.guilds.cache.map(async (guild) => this.assistants.add(app, guild)))
          .then(() => {
            this.#status = Status.ready;
            this.resetActivity();
            resolve();
          })
          .catch(reject);
      });
      this.client.login(this.#options?.token).catch(reject);
    });
  }

  async destroy(): Promise<void> {
    if (this.#status !== Status.ready) return;
    this.#status = Status.destroying;
    await this.assistants.destroy().catch();
    this.client.destroy();
    await sleep(500);
    this.#status = Status.destroyed;
  }

  isReady(): this is this & DiscordManager<true> {
    return this.#status === Status.ready;
  }

  resetActivity(): void {
    if (!this.isReady() || !this.#options || !this.#options.activity) return;
    const activity: ActivityOptions = { name: this.#options.activity.name };
    if (this.#options.activity.type) activity.type = ActivityType[this.#options.activity.type];
    if (this.#options.activity.url) activity.url = this.#options.activity.url;
    this.client.user.setActivity(activity);
  }

  #on<P extends keyof ClientEvents>(eventName: P, listener: (...args: ClientEvents[P]) => Awaitable<void>): void {
    if (!this.#eventNames.has(eventName)) return;
    this.client.on(eventName, listener);
  }

  #initializeEvents(app: App, log: Logger): void {
    const assistants = this.assistants;
    /*
     * System
     */
    this.#on('cacheSweep', (message) => log.debug?.(message));
    this.#on('debug', (message) => log.debug?.(message));
    this.#on('warn', (message) => log.warn(message));
    this.#on('error', (error) => log.error(error));
    this.#on('invalidated', () => log.error('Client session invalidated'));
    /*
     * Shard
     */
    this.#on('shardReady', (_, unavailableGuilds) => {
      log.info('Shard ready', unavailableGuilds ?? '');
    });
    this.#on('shardDisconnect', ({ code }) => {
      log.info('Shard disconnect', code === 1000 ? '' : code);
    });
    // this.#on('shardReconnecting', () => {
    //   log.info('Shard reconnecting');
    // });
    // this.#on('shardResume', (_, replayedEvents) => {
    //   log.info('Shard resume', replayedEvents);
    // });
    this.#on('shardError', (error) => {
      log.error('Shard error', error);
    });
    /*
     * Command
     */
    this.#on('interactionCreate', (interaction) => {
      if (!interaction.inCachedGuild()) {
        if (interaction.inGuild()) return;
        app.emit('interactionCreate', interaction as Interaction<undefined>);
        return;
      }
      const assistant = assistants.get(interaction.guild.id);
      if (!assistant) return;
      if (interaction.isChatInputCommand()) {
        const command = assistant.commands.get(interaction.commandName);
        if (command) {
          assistant.run({ type: 'slash', command, source: interaction });
          return;
        }
      }
      assistant.emit('interactionCreate', interaction);
    });
    this.#on('messageCreate', (message) => {
      if (!message.inGuild()) {
        app.emit('messageCreate', message as Message<false>);
        return;
      }
      const assistant = assistants.get(message.guild.id);
      if (!assistant) return;
      const command = message.author.bot ? null : assistant.interpret(message.content);
      assistant.emit('messageCreate', message, !!command);
      if (command) assistant.run({ type: 'text', command, source: message });
    });
    /*
     * Message
     */
    this.#on('messageDelete', (message) => {
      if (!message.inGuild()) {
        app.emit('messageDelete', message);
        return;
      }
      assistants.get(message.guild.id)?.emit('messageDelete', message);
    });
    this.#on('messageDeleteBulk', (messages, channel) => {
      assistants.get(channel.guild.id)?.emit('messageDeleteBulk', messages, channel);
    });
    this.#on('messageUpdate', (oldMessage, newMessage) => {
      if (!newMessage.inGuild()) {
        app.emit('messageUpdate', oldMessage, newMessage);
        return;
      }
      assistants.get(newMessage.guild.id)?.emit('messageUpdate', oldMessage, newMessage);
    });
    /*
     * Message reaction
     */
    this.#on('messageReactionAdd', (reaction, user) => {
      if (!reaction.message.inGuild()) {
        app.emit('messageReactionAdd', reaction, user);
        return;
      }
      assistants.get(reaction.message.guild.id)?.emit('messageReactionAdd', reaction, user);
    });
    this.#on('messageReactionRemove', (reaction, user) => {
      if (!reaction.message.inGuild()) {
        app.emit('messageReactionRemove', reaction, user);
        return;
      }
      assistants.get(reaction.message.guild.id)?.emit('messageReactionRemove', reaction, user);
    });
    this.#on('messageReactionRemoveAll', (message, reactions) => {
      if (!message.inGuild()) {
        app.emit('messageReactionRemoveAll', message, reactions);
        return;
      }
      assistants.get(message.guild.id)?.emit('messageReactionRemoveAll', message, reactions);
    });
    this.#on('messageReactionRemoveEmoji', (reaction) => {
      if (!reaction.message.inGuild()) {
        app.emit('messageReactionRemoveEmoji', reaction);
        return;
      }
      assistants.get(reaction.message.guild.id)?.emit('messageReactionRemoveEmoji', reaction);
    });
    /*
     * Guild
     */
    this.#on('guildCreate', async (guild) => {
      await assistants.add(app, guild);
      assistants.get(guild.id)?.emit('guildCreate', guild);
    });
    this.#on('guildDelete', async (guild) => {
      assistants.get(guild.id)?.emit('guildDelete', guild);
      await assistants.remove(guild.id);
    });
    this.#on('guildUpdate', (oldGuild, newGuild) => {
      assistants.get(oldGuild.id)?.emit('guildUpdate', oldGuild, newGuild);
    });
    this.#on('guildUnavailable', (guild) => {
      assistants.get(guild.id)?.emit('guildUnavailable', guild);
    });
    this.#on('guildIntegrationsUpdate', (guild) => {
      assistants.get(guild.id)?.emit('guildIntegrationsUpdate', guild);
    });
    /*
     * Guild member
     */
    this.#on('guildMemberAdd', (member) => {
      assistants.get(member.guild.id)?.emit('guildMemberAdd', member);
    });
    this.#on('guildMemberAvailable', (member) => {
      assistants.get(member.guild.id)?.emit('guildMemberAvailable', member);
    });
    this.#on('guildMemberRemove', (member) => {
      assistants.get(member.guild.id)?.emit('guildMemberRemove', member);
    });
    this.#on('guildMembersChunk', (members, guild, data) => {
      assistants.get(guild.id)?.emit('guildMembersChunk', members, guild, data);
    });
    this.#on('guildMemberUpdate', (oldMember, newMember) => {
      assistants.get(oldMember.guild.id)?.emit('guildMemberUpdate', oldMember, newMember);
    });
    /*
     * Guild ban
     */
    this.#on('guildBanAdd', (ban) => {
      assistants.get(ban.guild.id)?.emit('guildBanAdd', ban);
    });
    this.#on('guildBanRemove', (ban) => {
      assistants.get(ban.guild.id)?.emit('guildBanRemove', ban);
    });
    /*
     * Guild scheduled event
     */
    this.#on('guildScheduledEventCreate', (guildScheduledEvent) => {
      assistants.get(guildScheduledEvent.guildId)?.emit('guildScheduledEventCreate', guildScheduledEvent);
    });
    this.#on('guildScheduledEventDelete', (guildScheduledEvent) => {
      assistants.get(guildScheduledEvent.guildId)?.emit('guildScheduledEventDelete', guildScheduledEvent);
    });
    this.#on('guildScheduledEventUpdate', (oldGuildScheduledEvent, newGuildScheduledEvent) => {
      assistants
        .get(newGuildScheduledEvent.guildId)
        ?.emit('guildScheduledEventUpdate', oldGuildScheduledEvent, newGuildScheduledEvent);
    });
    this.#on('guildScheduledEventUserAdd', (guildScheduledEvent, user) => {
      assistants.get(guildScheduledEvent.guildId)?.emit('guildScheduledEventUserAdd', guildScheduledEvent, user);
    });
    this.#on('guildScheduledEventUserRemove', (guildScheduledEvent, user) => {
      assistants.get(guildScheduledEvent.guildId)?.emit('guildScheduledEventUserRemove', guildScheduledEvent, user);
    });
    /*
     * Invite
     */
    this.#on('inviteCreate', (invite) => {
      if (!invite.guild) return;
      assistants.get(invite.guild.id)?.emit('inviteCreate', invite);
    });
    this.#on('inviteDelete', (invite) => {
      if (!invite.guild) return;
      assistants.get(invite.guild.id)?.emit('inviteDelete', invite);
    });
    /*
     * Role
     */
    this.#on('roleCreate', (role) => {
      assistants.get(role.guild.id)?.emit('roleCreate', role);
    });
    this.#on('roleDelete', (role) => {
      assistants.get(role.guild.id)?.emit('roleDelete', role);
    });
    this.#on('roleUpdate', (oldRole, newRole) => {
      assistants.get(oldRole.guild.id)?.emit('roleUpdate', oldRole, newRole);
    });
    /*
     * Emoji
     */
    this.#on('emojiCreate', (emoji) => {
      assistants.get(emoji.guild.id)?.emit('emojiCreate', emoji);
    });
    this.#on('emojiDelete', (emoji) => {
      assistants.get(emoji.guild.id)?.emit('emojiDelete', emoji);
    });
    this.#on('emojiUpdate', (oldEmoji, newEmoji) => {
      assistants.get(oldEmoji.guild.id)?.emit('emojiUpdate', oldEmoji, newEmoji);
    });
    /*
     * Sticker
     */
    this.#on('stickerCreate', (sticker) => {
      if (!sticker.guild) return;
      assistants.get(sticker.guild.id)?.emit('stickerCreate', sticker);
    });
    this.#on('stickerDelete', (sticker) => {
      if (!sticker.guild) return;
      assistants.get(sticker.guild.id)?.emit('stickerDelete', sticker);
    });
    this.#on('stickerUpdate', (oldSticker, newSticker) => {
      if (!oldSticker.guild) return;
      assistants.get(oldSticker.guild.id)?.emit('stickerUpdate', oldSticker, newSticker);
    });
    /*
     * Channel
     */
    this.#on('channelCreate', (channel) => {
      assistants.get(channel.guild.id)?.emit('channelCreate', channel);
    });
    this.#on('channelDelete', (channel) => {
      if (channel.isDMBased()) {
        app.emit('channelDelete', channel);
        return;
      }
      assistants.get(channel.guild.id)?.emit('channelDelete', channel);
    });
    this.#on('channelUpdate', (oldChannel, newChannel) => {
      if (oldChannel.isDMBased()) {
        app.emit('channelUpdate', oldChannel, newChannel as DMChannel);
        return;
      }
      assistants.get(oldChannel.guild.id)?.emit('channelUpdate', oldChannel, newChannel as NonThreadGuildBasedChannel);
    });
    this.#on('channelPinsUpdate', (channel, date) => {
      if (channel.isDMBased()) {
        app.emit('channelPinsUpdate', channel, date);
        return;
      }
      assistants.get(channel.guild.id)?.emit('channelPinsUpdate', channel, date);
    });
    /*
     * Thread
     */
    this.#on('threadCreate', (thread, newlyCreated) => {
      assistants.get(thread.guild.id)?.emit('threadCreate', thread, newlyCreated);
    });
    this.#on('threadDelete', (thread) => {
      assistants.get(thread.guild.id)?.emit('threadDelete', thread);
    });
    this.#on('threadListSync', (threads, guild) => {
      assistants.get(guild.id)?.emit('threadListSync', threads, guild);
    });
    this.#on('threadMemberUpdate', (oldMember, newMember) => {
      assistants.get(oldMember.thread.guild.id)?.emit('threadMemberUpdate', oldMember, newMember);
    });
    this.#on('threadMembersUpdate', (addedMembers, removedMembers, thread) => {
      assistants.get(thread.guild.id)?.emit('threadMembersUpdate', addedMembers, removedMembers, thread);
    });
    this.#on('threadUpdate', (oldThread, newThread) => {
      assistants.get(oldThread.guild.id)?.emit('threadUpdate', oldThread, newThread);
    });
    /*
     * Stage
     */
    this.#on('stageInstanceCreate', (stageInstance) => {
      if (!stageInstance.guild) return;
      assistants.get(stageInstance.guild.id)?.emit('stageInstanceCreate', stageInstance);
    });
    this.#on('stageInstanceUpdate', (oldStageInstance, newStageInstance) => {
      if (!newStageInstance.guild) return;
      assistants.get(newStageInstance.guild.id)?.emit('stageInstanceUpdate', oldStageInstance, newStageInstance);
    });
    this.#on('stageInstanceDelete', (stageInstance) => {
      if (!stageInstance.guild) return;
      assistants.get(stageInstance.guild.id)?.emit('stageInstanceDelete', stageInstance);
    });
    /*
     * Misc
     */
    this.#on('webhookUpdate', (channel) => {
      assistants.get(channel.guild.id)?.emit('webhookUpdate', channel);
    });
    this.#on('applicationCommandPermissionsUpdate', (data) => {
      assistants.get(data.guildId)?.emit('applicationCommandPermissionsUpdate', data);
    });
    this.#on('presenceUpdate', (oldPresence, newPresence) => {
      if (!newPresence.guild) return;
      assistants.get(newPresence.guild.id)?.emit('presenceUpdate', oldPresence, newPresence);
    });
    this.#on('voiceStateUpdate', (oldState, newState) => {
      assistants.get(oldState.guild.id)?.emit('voiceStateUpdate', oldState, newState);
    });
    this.#on('typingStart', (typing) => {
      if (!typing.inGuild()) {
        app.emit('typingStart', typing);
        return;
      }
      assistants.get(typing.guild.id)?.emit('typingStart', typing);
    });
    this.#on('userUpdate', (oldUser, newUser) => {
      app.emit('userUpdate', oldUser, newUser);
    });
  }
}
