import {
  ApplicationCommandType,
  ChannelType,
  ContextMenuCommandBuilder,
  Locale as DiscordLocales,
  EmbedBuilder,
  PermissionsBitField,
} from 'discord.js';
import {
  createChannelOptions,
  createSwitchOptions,
  createVoiceIdOptions,
  findVoiceIdOption,
  parseVoiceId,
} from '../../utils';

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
    dictation: { type: 'simple' };
    sttEngine: { type: 'simple' };
    sttOutput: { type: 'simple' };
    deleteDictation: { type: 'simple' };
  };
  data: {
    guild: {
      channels: Record<string, { dictation: boolean; stt: VoiceConfig; output?: string }>;
    };
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
        dictation: 'Dictation',
        sttEngine: 'Voice Recognition Engine',
        sttOutput: 'Voice Recognition Output',
        deleteDictation: 'Delete Dictation',
      },
    },
    ja: {
      dict: {
        dictation: '議事録',
        sttEngine: '音声認識エンジン',
        sttOutput: '音声認識出力',
        deleteDictation: '議事録削除',
      },
    },
    'zh-CN': {
      dict: {
        dictation: '听写',
        sttEngine: '语音识别引擎',
        sttOutput: '语音识别输出',
        deleteDictation: '删除听写',
      },
    },
    'zh-TW': {
      dict: {
        dictation: '聽寫',
        sttEngine: '語音辨識引擎',
        sttOutput: '語音辨識輸出',
        deleteDictation: '刪除聽寫',
      },
    },
  },
  setupGuild({ assistant, config, dict, data }) {
    let prevDictation: { userId: string; channelId: string; time: number } | undefined;
    return {
      beforeConfigureVoiceChannel({ fields, locale, member, channel }) {
        const subDict = dict.sub(locale);
        const voiceIdOptions = createVoiceIdOptions(assistant.engines.maps.stt);
        const channelOptions = createChannelOptions(ChannelType.GuildText, assistant.guild.channels.cache, member);
        const channelConfig = {
          dictation: false,
          stt: { ...assistant.defaultSTT },
          ...data.channels?.[channel.id],
        };
        const update = (): void => {
          const channels = data.channels ?? {};
          channels[channel.id] = channelConfig;
          data.channels = channels;
        };
        const reload = (): void => {
          const current = assistant.voice;
          if (!current || current.channelId !== channel.id) return;
          const selfDeaf = !(config.command || channelConfig.dictation);
          if (current.selfDeaf === selfDeaf) return;
          if (selfDeaf) {
            assistant.deafen();
          } else {
            assistant.undeafen();
          }
          assistant.rejoin().catch(assistant.log.error);
        };
        fields.push({
          name: subDict.get('dictation'),
          options: createSwitchOptions(),
          value: !!data.channels?.[channel.id]?.dictation,
          update: (value) => {
            channelConfig.dictation = value;
            update();
            reload();
          },
        });
        fields.push({
          name: subDict.get('sttEngine'),
          options: voiceIdOptions,
          value: findVoiceIdOption(voiceIdOptions, channelConfig.stt)?.value ?? '',
          update: (value) => {
            const voice = parseVoiceId(value);
            if (!voice) return false;
            channelConfig.stt = voice;
            update();
            return true;
          },
        });
        fields.push({
          name: subDict.get('sttOutput'),
          options: [{ value: '_', label: `🔊 ${channel.name}` }, ...channelOptions],
          value: channelConfig.output ?? '_',
          update: (value) => {
            if (value === '_') {
              delete channelConfig.output;
            } else {
              channelConfig.output = value;
            }
            update();
          },
        });
      },
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
        options.selfDeaf = !(config.command || data.channels?.[options.channelId]?.dictation);
      },
      onJoin(channel) {
        // when moved to other channel by user, bot's self-deaf status could be wrong
        // it can be covered by `assistant.rejoin()` here but it's not worth it
        if (config.command || data.channels?.[channel.id]?.dictation) {
          assistant.undeafen();
        } else {
          assistant.deafen();
        }
      },
      onLeave() {
        assistant.deafen();
        prevDictation = undefined;
      },
      onListen(audio) {
        const options = data.channels?.[audio.channel.id]?.stt ?? assistant.defaultSTT;
        assistant.transcribe({
          engine: options.engine,
          locale: options.locale,
          request: {
            voice: options.voice,
            interim: config.command && config.timeout > 0,
            audio,
          },
        });
      },
      beforeTranscribe(request) {
        const audio = request.audio;
        const channelConfig = data.channels?.[audio.channel.id];
        if (channelConfig?.output) {
          const channel = assistant.guild.channels.cache.get(channelConfig.output);
          if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice)) {
            audio.destination = channel;
          }
        }
        if (channelConfig?.dictation) {
          request.interim = false;
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
        if (request.interim && config.command && config.timeout > 0) {
          const timer = setTimeout(() => audio.abort(), config.timeout);
          const onResult = (transcript: string): void => {
            if (!assistant.activation.pattern.test(transcript)) return;
            clearTimeout(timer);
            audio.off('result', onResult);
          };
          audio.on('result', onResult);
        }
        audio.once('end', () => {
          if (audio.aborted || audio.transcript.length === 0) return;
          const command = assistant.interpret(audio.transcript);
          if (command) assistant.run({ type: 'voice', command, source: audio });
        });
      },
      onMessageCreate(message) {
        if (prevDictation && message.author.id !== assistant.self.id && prevDictation.channelId === message.channelId) {
          prevDictation = undefined;
        }
      },
      onChannelDelete(channel) {
        const channels = data.channels;
        if (!channels?.[channel.id]) return;
        delete channels[channel.id];
        data.channels = channels;
      },
    };
  },
};
