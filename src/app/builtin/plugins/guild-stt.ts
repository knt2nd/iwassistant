import {
  ApplicationCommandType,
  ChannelType,
  ContextMenuCommandBuilder,
  Locale as DiscordLocales,
  EmbedBuilder,
  PermissionsBitField,
} from 'discord.js';

export type Options = {
  config: {
    /**
     * Enable voice commands, forcibly enabled when dictating
     * @default false
     */
    command: boolean;
    /**
     * Wait time for activation word when not dictating
     * @default 3_000
     */
    timeout: number;
    /**
     * Nameless time of dictation
     * @default 300_000
     */
    nameless: number;
  };
  dict: {
    deleteDictation: { type: 'simple' };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-stt',
  description: 'Discord speech-to-text',
  config: {
    command: false,
    timeout: 3000,
    nameless: 300_000,
  },
  i18n: {
    en: {
      dict: {
        deleteDictation: 'Delete Dictation',
      },
    },
    ja: {
      dict: {
        deleteDictation: '議事録削除',
      },
    },
    'zh-CN': {
      dict: {
        deleteDictation: '删除听写',
      },
    },
    'zh-TW': {
      dict: {
        deleteDictation: '刪除聽寫',
      },
    },
  },
  setupGuild({ config, dict, assistant }) {
    let prevDictation: { userId: string; channelId: string; time: number } | undefined;
    let allChannelConfigs = assistant.data.get('guild-config')?.voiceChannels;
    assistant.data.subscribe('guild-config', async (value) => {
      allChannelConfigs = value?.voiceChannels;
      const current = assistant.voice;
      if (!current) return;
      const options = allChannelConfigs?.[current.channelId];
      if (!options) return;
      const selfDeaf = !(config.command || options.dictation);
      if (current.selfDeaf === selfDeaf) return;
      if (selfDeaf) {
        assistant.deafen();
      } else {
        assistant.undeafen();
      }
      await assistant.rejoin();
    });
    return {
      beforeCommandsUpdate(commands) {
        const command = new ContextMenuCommandBuilder()
          .setType(ApplicationCommandType.Message)
          .setDefaultMemberPermissions(new PermissionsBitField('SendMessages').bitfield)
          .setName('delete-dictation');
        for (const locale of Object.values(DiscordLocales)) {
          command.setNameLocalization(locale, dict.sub(locale).get('deleteDictation'));
        }
        commands.push(command);
      },
      async onInteractionCreate(interaction) {
        if (!interaction.isMessageContextMenuCommand() || interaction.commandName !== 'delete-dictation') return;
        const message = interaction.targetMessage;
        const url = new URL(message.embeds[0]?.url ?? 'http://dummy');
        if (message.author.id !== assistant.self.id || url.searchParams.get('user') !== interaction.member.id) {
          await interaction.reply({ content: '🚫', ephemeral: true });
          return;
        }
        await message.delete();
        await interaction.reply({ content: '✅', ephemeral: true });
      },
      beforeJoin(options) {
        options.selfDeaf = !(config.command || allChannelConfigs?.[options.channelId]?.dictation);
      },
      onJoin(channel) {
        // when moved to other channel by user, bot's self-deaf status could be wrong
        // it can be covered by `assistant.rejoin()` here but it's not worth it
        const selfDeaf = !(config.command || allChannelConfigs?.[channel.id]?.dictation);
        if (selfDeaf) {
          assistant.deafen();
        } else {
          assistant.undeafen();
        }
      },
      onLeave() {
        assistant.deafen();
        prevDictation = undefined;
      },
      onListen(audio) {
        let interim = config.command && config.timeout > 0;
        const channelConfig = allChannelConfigs?.[audio.channel.id];
        if (channelConfig?.output) {
          const channel = assistant.guild.channels.cache.get(channelConfig.output);
          if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice)) {
            audio.destination = channel;
          }
        }
        if (channelConfig?.dictation) {
          interim = false;
          audio.once('end', async (request) => {
            if (audio.transcript.length === 0) return;
            const now = Date.now();
            const member = request.audio.member;
            const url = new URL(audio.channel.url);
            url.searchParams.set('type', 'dictation');
            url.searchParams.set('client', assistant.guild.client.user.id);
            url.searchParams.set('user', member.id);
            const embed = new EmbedBuilder().setURL(url.toString()).setDescription(audio.transcript);
            if (!prevDictation || member.id !== prevDictation.userId || now > prevDictation.time + config.nameless) {
              embed.setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() });
            }
            const destination = await audio.destination.send({ embeds: [embed] });
            assistant.emit('dictationCreate', { request, source: request.audio, destination, member });
            prevDictation = { userId: member.id, channelId: audio.destination.id, time: now };
          });
        }
        audio.once('end', () => {
          if (audio.aborted || audio.transcript.length === 0) return;
          const command = assistant.interpret(audio.transcript);
          if (command) assistant.run({ type: 'voice', command, source: audio });
        });
        if (interim) {
          const timer = setTimeout(() => audio.abort(), config.timeout);
          const onResult = (transcript: string): void => {
            if (!assistant.activation.pattern.test(transcript)) return;
            clearTimeout(timer);
            audio.off('result', onResult);
          };
          audio.on('result', onResult);
        }
        const options = { ...(channelConfig?.stt ?? assistant.defaultSTT) };
        assistant.transcribe({
          engine: {
            name: options.name,
            locale: options.locale,
          },
          request: {
            voice: options.voice,
            interim,
            audio,
          },
        });
      },
      onMessageCreate(message) {
        if (prevDictation && message.author.id !== assistant.self.id && prevDictation.channelId === message.channelId) {
          prevDictation = undefined;
        }
      },
    };
  },
};
