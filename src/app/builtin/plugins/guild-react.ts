import type { GuildEmoji, Message } from 'discord.js';
import { ChannelType, formatEmoji } from 'discord.js';
import { decodeMessage, omitString, pickRandom, rand, sleep } from '../../utils';

function waitTime(): number {
  return rand(1000, 3000);
}

type Action = {
  pattern: RegExp;
  chance: number;
  emoji: (string | GuildEmoji)[][];
  text: string[];
  suspend: number;
};

export type Options = {
  config: {
    /**
     * Action settings
     */
    actions: {
      /**
       * Search pattern, RegExp format
       */
      pattern: string;
      /**
       * Probability: 0-100
       * @default 100
       */
      chance?: number;
      /**
       * Standard and custom emoji reactions, picked randomly
       */
      emoji?: (string | string[])[];
      /**
       * Text replies, picked randomly
       * @example "<@${id}> ${name} is in <@&__ROLE_ID__> <#__CHANNEL_ID__>"
       */
      text?: string[];
      /**
       * Suspend time for next action
       * @default 60_000
       */
      suspend?: number;
    }[];
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-react',
  description: 'Discord message auto-reactions',
  config: {
    actions: [
      // // example
      // {
      //   pattern: '^👍$',
      //   chance: 50,
      //   emoji: ['👍', '😀', '❤️', ['🙆', '🙆‍♀️', '🙆‍♂️']],
      //   text: ['<@${id}> 🎉', '${name}~ 😆'],
      //   suspend: 30_000,
      // },
    ],
  },
  setupGuild({ config, assistant }) {
    let lock = false;
    const actions: Action[] = [];
    for (const _action of config.actions) {
      if (_action.pattern.length === 0) continue;
      let pattern: RegExp | undefined;
      try {
        pattern = new RegExp(_action.pattern, 'is');
      } catch (error) {
        assistant.log.warn('[REACT]', error);
        continue;
      }
      const action: Action = {
        pattern,
        chance: _action.chance ?? 100,
        emoji: [],
        text: [],
        suspend: _action.suspend ?? 60_000,
      };
      if (_action.emoji) {
        for (let _emojis of _action.emoji) {
          const emojis: (string | GuildEmoji)[] = [];
          if (typeof _emojis === 'string') _emojis = [_emojis];
          for (const _emoji of _emojis) {
            const emoji = assistant.guild.emojis.cache.find((emoji) => emoji.name === _emoji);
            if (emoji) {
              emojis.push(emoji);
            } else {
              emojis.push(_emoji);
            }
          }
          if (emojis.length > 0) action.emoji.push(emojis);
        }
      }
      if (_action.text) {
        for (const _text of _action.text) {
          let text = omitString(_text, 2000);
          for (const emoji of assistant.guild.emojis.cache.values()) {
            if (!emoji.name) continue;
            text = text.replaceAll(`:${emoji.name}:`, formatEmoji(emoji.id, !!emoji.animated));
          }
          action.text.push(text);
        }
      }
      actions.push(action);
    }
    if (actions.length === 0) return {};
    const react = async (content: string, message: Message<true>): Promise<void> => {
      if (message.channel.type !== ChannelType.GuildText && message.channel.type !== ChannelType.GuildVoice) return;
      const action = actions.find((action) => content.match(action.pattern) && action.chance > rand(0, 100));
      if (!action) return;
      lock = true;
      const emojis = pickRandom(action.emoji);
      if (emojis) {
        await sleep(waitTime());
        for (const emoji of emojis) {
          try {
            await message.react(emoji);
            await sleep(500);
          } catch (error) {
            assistant.log.warn('[REACT]', error);
          }
        }
      }
      let text = pickRandom(action.text);
      if (text) {
        await sleep(waitTime());
        text = text.replaceAll('${id}', message.author.id);
        if (text.includes('${name}')) {
          const member = message.member ?? (await assistant.guild.members.fetch(message.author.id));
          text = text.replaceAll('${name}', member.displayName);
        }
        const typingTime = waitTime() + text.length * 50;
        // https://discordjs.guide/additional-info/changes-in-v13.html#textchannel
        // > This method automatically stops typing after 10 seconds, or when a message is sent.
        await message.channel.sendTyping();
        await sleep(typingTime < 10_000 ? typingTime : 10_000);
        const sentMessage = await message.channel.send(text);
        const voiceChannelId = assistant.voice?.channelId;
        if (voiceChannelId) {
          const target = assistant.data.get('guild-config')?.voiceChannels?.[voiceChannelId]?.input ?? 'all';
          if (target === 'all' || target === message.channelId) {
            assistant.speak(decodeMessage(sentMessage.content, sentMessage));
          }
        }
      }
      setTimeout(() => (lock = false), action.suspend);
    };
    return {
      async onMessageCreate(message, commanded) {
        if (lock || message.author.bot || commanded) return;
        await react(message.content, message);
      },
      async onDictationCreate(dictation) {
        if (lock) return;
        await react(dictation.source.transcript, dictation.destination);
      },
    };
  },
};
