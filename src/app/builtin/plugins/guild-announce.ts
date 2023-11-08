import { sleep } from '../../utils';

const JoinAnnounceSuspendTime = 5 * 60 * 1000;

export type Options = {
  dict: {
    join: { type: 'random'; options: 'name' };
    stream: { type: 'random'; options: 'name' };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-announce',
  description: 'Discord voice channel announcements',
  i18n: {
    en: {
      dict: {
        join: ['Hello, ${name}', 'Welcome, ${name}'],
        stream: ['Attention please, ${name} just started streaming'],
      },
    },
    ja: {
      dict: {
        join: ['${name}さん、こんにちは', '${name}さん、いらっしゃい'],
        stream: ['アテンションプリーズ。${name}さんが配信を始めたよ'],
      },
    },
    zh: {
      dict: {
        join: ['${name}，您好', '欢迎，${name}'],
        stream: ['请注意，${name}开始流式传输了'],
      },
    },
  },
  setupGuild({ assistant, dict }) {
    const leftTimes = new Map<string, number>();
    return {
      async onVoiceStateUpdate(oldState, newState) {
        if (newState.member?.user.bot) return; // fetching member is too much
        const current = assistant.voice;
        if (!current) return;
        if (!oldState.streaming && newState.streaming) {
          const name = (newState.member ?? (await assistant.guild.members.fetch(newState.id))).displayName;
          assistant.speak(dict.get('stream', { name }));
          return;
        }
        if (oldState.channelId === newState.channelId) return;
        if (current.channelId === newState.channelId) {
          const leftTime = leftTimes.get(oldState.id) ?? 0;
          if (Date.now() - leftTime < JoinAnnounceSuspendTime) return;
          await sleep(2000);
          const name = (oldState.member ?? (await assistant.guild.members.fetch(oldState.id))).displayName;
          assistant.speak(dict.get('join', { name }));
          return;
        }
        if (current.channelId === oldState.channelId) leftTimes.set(newState.id, Date.now());
      },
      onLeave() {
        leftTimes.clear();
      },
    };
  },
};
