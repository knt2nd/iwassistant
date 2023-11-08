import { EmbedBuilder } from '@discordjs/builders';
import type { Message, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { createSwitchOptions, decodeMessage, omitString } from '../../utils';

function createId(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): string {
  return `${reaction.message.id}/${user.id}/${reaction.emoji.identifier}`;
}

export type Options = {
  config: {
    /**
     * Enable reaction notifier by default
     * @default false
     */
    reaction: boolean;
    /**
     * Delay time to notify
     * @default 3000
     */
    delay: number;
    /**
     * Fetch partial messages, set `false` if you encounter a performance issue
     * @default true
     * @see https://discordjs.guide/popular-topics/partials.html
     */
    partial: boolean;
  };
  dict: {
    reaction: { type: 'simple' };
  };
  data: {
    guild: {
      users: Record<string, { reaction: boolean }>;
    };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-notify',
  description: 'Discord DM notifier',
  config: {
    reaction: false,
    delay: 3000,
    partial: true,
  },
  i18n: {
    en: {
      dict: {
        reaction: 'Notification - Reaction',
      },
    },
    ja: {
      dict: {
        reaction: '通知 - リアクション',
      },
    },
    'zh-CN': {
      dict: {
        reaction: '通知 - 反应',
      },
    },
    'zh-TW': {
      dict: {
        reaction: '通知 - 反應',
      },
    },
  },
  setupGuild({ assistant, config, dict, data }) {
    const timers = new Map<string, NodeJS.Timeout>();
    return {
      beforeConfigureUser({ fields, locale, member }) {
        const subDict = dict.sub(locale);
        const userConfig = { reaction: config.reaction, ...data.users?.[member.id] };
        const update = (): void => {
          const users = data.users ?? {};
          users[member.id] = userConfig;
          data.users = users;
        };
        fields.push({
          name: subDict.get('reaction'),
          options: createSwitchOptions(),
          value: userConfig.reaction,
          update: (value) => {
            userConfig.reaction = value;
            update();
          },
        });
      },
      async onMessageReactionAdd(reaction, user) {
        if (user.bot || (!config.partial && reaction.message.partial)) return;
        const message = (reaction.message.partial ? await reaction.message.fetch() : reaction.message) as Message<true>;
        if (message.author.bot) return;
        if (!(data.users?.[message.author.id]?.reaction ?? config.reaction)) return;
        const emojiId = reaction.emoji.id ?? reaction.emoji.name;
        if (!emojiId) return;
        const id = createId(reaction, user);
        if (timers.has(id)) return;
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            // FIXME to strictly implement, should check a specific user reaction
            if (!message.reactions.cache.has(emojiId)) return;
            (async () => {
              const member = await assistant.guild.members.fetch(user.id);
              const description = omitString(decodeMessage(message.content.replaceAll('\n', ' '), message), 20);
              const embed = new EmbedBuilder()
                .setURL(message.url)
                .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
                .setDescription(description.length > 0 ? description : '...');
              let title = `${assistant.guild.name}   ${message.channel.name}`;
              if (reaction.emoji.url) {
                embed.setThumbnail(reaction.emoji.url);
              } else if (reaction.emoji.name) {
                title += `   ${reaction.emoji.name}`;
              }
              embed.setTitle(title);
              await message.author.send({ embeds: [embed] });
            })().catch(assistant.log.error);
          }, config.delay),
        );
      },
      onMessageReactionRemove(reaction, user) {
        if (user.bot) return;
        const id = createId(reaction, user);
        const timer = timers.get(id);
        if (!timer) return;
        clearTimeout(timer);
        timers.delete(id);
      },
      onGuildMemberRemove(member) {
        const users = data.users;
        if (!users?.[member.id]) return;
        delete users[member.id];
        data.users = users;
      },
    };
  },
};
