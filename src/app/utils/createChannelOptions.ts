import type { Collection, GuildBasedChannel, GuildMember, PermissionResolvable } from 'discord.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const Prefixes = {
  [ChannelType.GuildText]: '♯',
  [ChannelType.GuildVoice]: '🔊',
};

export function createChannelOptions(
  type: ChannelType.GuildText | ChannelType.GuildVoice,
  channels: Collection<string, GuildBasedChannel>,
  member: GuildMember,
  permissions: PermissionResolvable = PermissionFlagsBits.ViewChannel,
): SelectOption[] {
  return channels
    .filter((c) => c.type === type && c.permissionsFor(member).has(permissions))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: `${Prefixes[type]} ${c.name}` }));
}
