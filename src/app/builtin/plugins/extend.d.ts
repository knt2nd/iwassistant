interface AvailablePlugins {
  'guild-announce': AvailablePlugin<import('./guild-announce').Options>;
  'guild-config': AvailablePlugin<import('./guild-config').Options>;
  'guild-default': AvailablePlugin<import('./guild-default').Options>;
  'guild-follow': AvailablePlugin<import('./guild-follow').Options>;
  'guild-help': AvailablePlugin<import('./guild-help').Options>;
  'guild-notify': AvailablePlugin<import('./guild-notify').Options>;
  'guild-react': AvailablePlugin<import('./guild-react').Options>;
  'guild-stt': AvailablePlugin<import('./guild-stt').Options>;
  'guild-summon': AvailablePlugin<import('./guild-summon').Options>;
  'guild-translate': AvailablePlugin<import('./guild-translate').Options>;
  'guild-tts': AvailablePlugin<import('./guild-tts').Options>;
}

interface GuildInterface {
  beforeConfigureGuild(context: ConfigureContext): Awaitable<void>;
  beforeConfigureTextChannel(context: ConfigureContext<{ channel: import('discord.js').TextChannel }>): Awaitable<void>;
  beforeConfigureVoiceChannel(
    context: ConfigureContext<{ channel: import('discord.js').VoiceChannel }>,
  ): Awaitable<void>;
  beforeConfigureUser(context: ConfigureContext): Awaitable<void>;
}
