import { sleep } from '../../utils';

export type Options = {
  command: {
    join: { type: 'guild' };
    leave: { type: 'guild' };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-summon',
  description: 'Discord voice channel join/leave commands',
  permissions: {
    join: ['Speak'],
    leave: ['Speak'],
  },
  i18n: {
    en: {
      command: {
        join: {
          description: 'Join voice channel',
          example: 'join',
          patterns: ['join'],
        },
        leave: {
          description: 'Leave voice channel',
          example: 'leave',
          patterns: ['leave'],
        },
      },
    },
    ja: {
      command: {
        join: {
          description: 'ボイスチャンネルに呼ぶ',
          example: 'こっちきて',
          patterns: ['こっち[にへ]?[き来]'],
        },
        leave: {
          description: 'ボイスチャンネルから退室させる',
          example: 'あっちいって',
          patterns: ['あっち[にへ]?[い行]'],
        },
      },
    },
    'zh-CN': {
      command: {
        join: {
          description: '加入语音频道',
          example: '加入',
          patterns: ['加入'],
        },
        leave: {
          description: '离开语音频道',
          example: '离开',
          patterns: ['离开'],
        },
      },
    },
    'zh-TW': {
      command: {
        join: {
          description: '加入語音頻道',
          example: '加入',
          patterns: ['加入'],
        },
        leave: {
          description: '離開語音頻道',
          example: '離開',
          patterns: ['離開'],
        },
      },
    },
  },
  setupGuild({ assistant }) {
    return {
      async commandJoin({ member }) {
        const channel = member.voice.channel;
        if (!channel) return false;
        const res = await assistant.join(channel.id);
        if (!res) return false;
        await sleep(500);
        return;
      },
      commandLeave() {
        return assistant.leave();
      },
    };
  },
};
