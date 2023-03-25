import type { VoiceBasedChannel, VoiceChannel } from 'discord.js';

function countHuman(channel: VoiceBasedChannel): number {
  return channel.members.filter((member) => !member.user.bot).size;
}

export type Options = {
  data: {
    guild: {
      _resumeId: string;
    };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-follow',
  description: 'Discord voice channel auto-join/auto-leave',
  setupGuild({ data, assistant }) {
    let currentChannel: VoiceChannel | undefined;
    return {
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
          if (!oldState.channel && newState.channel && countHuman(newState.channel) === 1) {
            const channelConfig = assistant.data.get('guild-config')?.voiceChannels?.[newState.channel.id];
            if (channelConfig ? channelConfig.join : assistant.attachments.get('guild-config')?.config['autoJoin']) {
              await assistant.join(newState.channel.id);
            }
          }
        }
      },
    };
  },
};
