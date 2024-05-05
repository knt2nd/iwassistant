import { ChannelType, EmbedBuilder } from 'discord.js';
import { configure } from '../../utils';

export type Options = {
  config: {
    /**
     * DM deletion time
     * @default 600_000
     */
    timeout: number;
  };
  command: {
    configServer: { type: 'guild' };
    configChannel: { type: 'guild' };
    configUser: { type: 'guild' };
  };
  dict: {
    settings: { type: 'simple'; options: 'name' };
    textToVoice: { type: 'simple' };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-config',
  description: 'Discord guild config commands',
  config: {
    timeout: 0, // fallback to `configure()` default
  },
  permissions: {
    configServer: ['ManageGuild'],
    configChannel: ['ManageChannels'],
    configUser: ['SendMessages'],
  },
  i18n: {
    en: {
      command: {
        configServer: {
          description: 'Server settings',
          example: 'server settings',
          patterns: ['server.*?(config|setting)'],
        },
        configChannel: {
          description: 'Text/voice channel settings',
          example: 'channel settings',
          patterns: ['channel.*?(config|setting)'],
        },
        configUser: {
          description: 'User settings',
          example: 'user settings',
          patterns: ['user.*?(config|setting)'],
        },
      },
      dict: {
        settings: "${name}'s Settings",
        textToVoice:
          'Tips: To configure a voice channel, run `/config-channel` in [a text chat in a voice channel](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)',
      },
    },
    ja: {
      command: {
        configServer: {
          description: 'サーバー設定',
          example: 'サーバー設定',
          patterns: ['サーバー設定'],
        },
        configChannel: {
          description: 'テキスト/ボイスチャンネルの設定',
          example: 'チャンネル設定',
          patterns: ['チャンネル設定'],
        },
        configUser: {
          description: 'ユーザー設定',
          example: 'ユーザー設定',
          patterns: ['ユーザー設定'],
        },
      },
      dict: {
        settings: '${name} の設定',
        textToVoice:
          'Tips: ボイスチャンネルを設定するには、[ボイスチャンネル付属のテキストチャット](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)で `/config-channel` を実行してください',
      },
    },
    'zh-CN': {
      command: {
        configServer: {
          description: '伺服器设定',
          example: '伺服器设定',
          patterns: ['伺服器设定'],
        },
        configChannel: {
          description: '文字/语音频道设定',
          example: '频道设定',
          patterns: ['频道设定'],
        },
        configUser: {
          description: '用户设定',
          example: '用户设定',
          patterns: ['用户设定'],
        },
      },
      dict: {
        settings: '${name} 的设定',
        textToVoice:
          'Tips: 要配置语音频道，请在[语音频道的文本聊天](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)中运行 `/config-channel`',
      },
    },
    'zh-TW': {
      command: {
        configServer: {
          description: '伺服器設定',
          example: '伺服器設定',
          patterns: ['伺服器設定'],
        },
        configChannel: {
          description: '文字/語音頻道設定',
          example: '頻道設定',
          patterns: ['頻道設定'],
        },
        configUser: {
          description: '用戶設定',
          example: '用戶設定',
          patterns: ['用戶設定'],
        },
      },
      dict: {
        settings: '${name} 的設定',
        textToVoice:
          'Tips: 要配置語音頻道，請在[語音頻道的文本聊天](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)中運行 `/config-channel`',
      },
    },
  },
  setupGuild({ assistant, config, dict }) {
    return {
      async commandConfigServer({ locale, member }) {
        const subDict = dict.sub(locale);
        await configure({
          title: `⚙️ ${subDict.get('settings', { name: assistant.guild.name })}`,
          user: member.user,
          timeout: config.timeout,
          fieldsGenerator: async () => {
            const context: ConfigureContext = { fields: [], locale, member };
            await assistant.hook('configureGuild', context);
            return context.fields;
          },
          errorHandler: assistant.log.error,
        });
      },
      async commandConfigChannel({ locale, member, channel }) {
        const subDict = dict.sub(locale);
        switch (channel.type) {
          case ChannelType.GuildText: {
            await configure({
              title: `♯ ${assistant.guild.name}: ${subDict.get('settings', { name: channel.name })}`,
              user: member.user,
              timeout: config.timeout,
              fieldsGenerator: async () => {
                const context: ConfigureContext = { fields: [], locale, member };
                await assistant.hook('configureTextChannel', { ...context, channel });
                return context.fields;
              },
              messageModifier: (message, page) => {
                if (page > 1 || !Array.isArray(message.embeds)) return message;
                message.embeds.unshift(new EmbedBuilder().setDescription(subDict.get('textToVoice')));
                return message;
              },
              errorHandler: assistant.log.error,
            });
            return;
          }
          case ChannelType.GuildVoice: {
            await configure({
              title: `🔊 ${assistant.guild.name}: ${subDict.get('settings', { name: channel.name })}`,
              user: member.user,
              timeout: config.timeout,
              fieldsGenerator: async () => {
                const context: ConfigureContext = { fields: [], locale, member };
                await assistant.hook('configureVoiceChannel', { ...context, channel });
                return context.fields;
              },
              errorHandler: assistant.log.error,
            });
            return;
          }
        }
      },
      async commandConfigUser({ locale, member }) {
        const subDict = dict.sub(locale);
        await configure({
          title: `👤 ${assistant.guild.name}: ${subDict.get('settings', { name: member.displayName })}`,
          user: member.user,
          timeout: config.timeout,
          fieldsGenerator: async () => {
            const context: ConfigureContext = { fields: [], locale, member };
            await assistant.hook('configureUser', context);
            return context.fields;
          },
          errorHandler: assistant.log.error,
        });
      },
    };
  },
};
