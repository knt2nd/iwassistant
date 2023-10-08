import type { Guild, Message } from 'discord.js';

// https://github.com/discordjs/discord-api-types/blob/main/globals.ts

const MemberPattern = /<@!?(\d{17,20})>/g;

const RolePattern = /<@&(\d{17,20})>/g;

const ChannelPattern = /<#(\d{17,20})>/g;

const EmojiPattern = /<a?(:\w{2,32}:)\d{17,20}>/g;

function isMessage(resolver: Message | Guild): resolver is Message {
  return !!(resolver as { mentions: object }).mentions;
}

// lazy decode (no fetch)
export function decodeMessage(content: string, resolver: Message | Guild): string {
  return content
    .replaceAll(MemberPattern, (match, id: string) => {
      const name = isMessage(resolver)
        ? resolver.inGuild()
          ? resolver.mentions.members.get(id)?.displayName
          : resolver.mentions.users.get(id)?.username
        : resolver.members.cache.get(id)?.displayName;
      return name ? `@${name}` : match;
    })
    .replaceAll(RolePattern, (match, id: string) => {
      const role = isMessage(resolver) ? resolver.mentions.roles.get(id) : resolver.roles.cache.get(id);
      return role ? `@${role.name}` : match;
    })
    .replaceAll(ChannelPattern, (match, id: string) => {
      const channel = isMessage(resolver) ? resolver.mentions.channels.get(id) : resolver.channels.cache.get(id);
      return channel && !channel.isDMBased() ? `#${channel.name}` : match;
    })
    .replaceAll(EmojiPattern, '$1');
}
