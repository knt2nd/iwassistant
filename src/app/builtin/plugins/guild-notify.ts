import { EmbedBuilder } from '@discordjs/builders';
import type { Message, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { decodeMessage, omitString } from '../../utils';

function createId(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): string {
  return `${reaction.message.id}/${user.id}/${reaction.emoji.identifier}`;
}

export type Options = {
  config: {
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
};

export const plugin: IPlugin<Options> = {
  name: 'guild-notify',
  description: 'Discord message reaction notifier',
  config: {
    delay: 3000,
    partial: true,
  },
  setupGuild({ config, assistant }) {
    const timers = new Map<string, NodeJS.Timeout>();
    return {
      async onMessageReactionAdd(reaction, user) {
        if (user.bot || (!config.partial && reaction.message.partial)) return;
        const message = (reaction.message.partial ? await reaction.message.fetch() : reaction.message) as Message<true>;
        if (message.author.bot) return;
        if (!assistant.data.get('guild-config')?.users?.[message.author.id]?.notification.reaction) return;
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
    };
  },
};
