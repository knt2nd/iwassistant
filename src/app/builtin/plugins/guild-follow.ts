import type { VoiceBasedChannel, VoiceChannel } from 'discord.js';
import { createSwitchOptions } from '../../utils';

function countHuman(channel: VoiceBasedChannel): number {
  return channel.members.filter((member) => !member.user.bot).size;
}

export type Options = {
  config: {
    /**
     * Enable auto-join by default
     * @default true
     */
    autoJoin: boolean;
  };
  dict: {
    autoJoin: { type: 'simple' };
  };
  data: {
    guild: {
      _resumeId: string;
      channels: Record<string, { autoJoin: boolean }>;
    };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-follow',
  description: 'Discord voice channel auto-join/auto-leave',
  config: {
    autoJoin: true,
  },
  i18n: {
    en: {
      dict: {
        autoJoin: 'Auto Join',
      },
    },
    ja: {
      dict: {
        autoJoin: '自動入室',
      },
    },
    'zh-CN': {
      dict: {
        autoJoin: '自动加入',
      },
    },
    'zh-TW': {
      dict: {
        autoJoin: '自動加入',
      },
    },
  },
  setupGuild({ assistant, config, dict, data }) {
    let currentChannel: VoiceChannel | undefined;
    return {
      beforeConfigureVoiceChannel({ fields, locale, channel }) {
        const subDict = dict.sub(locale);
        const channelConfig = { autoJoin: config.autoJoin, ...data.channels?.[channel.id] };
        const update = (): void => {
          const channels = data.channels ?? {};
          channels[channel.id] = channelConfig;
          data.channels = channels;
        };
        fields.push({
          name: subDict.get('autoJoin'),
          options: createSwitchOptions(),
          value: channelConfig.autoJoin,
          update: (value) => {
            channelConfig.autoJoin = value;
            update();
          },
        });
      },
      async onReady() {
        if (!data._resumeId) return;
        const channel = assistant.guild.channels.cache.get(data._resumeId);
        if (!channel || !channel.isVoiceBased() || countHuman(channel) === 0) return;
        await assistant.join(data._resumeId);
      },
      onJoin(channel) {
        data._resumeId = channel.id;
        currentChannel = channel;
      },
      onLeave() {
        currentChannel = undefined;
        delete data._resumeId;
      },
      async onVoiceStateUpdate(oldState, newState) {
        if (newState.member?.user.bot) return; // fetching member is too much
        if (currentChannel) {
          if (oldState.channel && oldState.channel.id === currentChannel.id && countHuman(currentChannel) === 0) {
            // the following procedure causes a bot being alone, it can be fixed but it's not worth it
            // bot disconnected by user -> connection destroyed -> last user left
            assistant.leave();
          }
        } else {
          if (
            !oldState.channel &&
            newState.channel &&
            (data.channels?.[newState.channel.id]?.autoJoin ?? config.autoJoin) &&
            countHuman(newState.channel) === 1
          ) {
            await assistant.join(newState.channel.id);
          }
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
