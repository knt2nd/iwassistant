import type { GuildMember, Message, MessageReaction } from 'discord.js';
import { decodeMessage, isLocale } from '../../utils';

// Note: Some TTS engines don't read some emojis but it should notify when someone posts a short emoji message somehow
const EmojiOnly = /^(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)$/u;

const CancelableLength = 30;

const CancelEmoji = '⏭';

export type Options = {
  config: {
    /**
     * Strippers for messages
     */
    strippers: [pattern: string, flag: string][];
    /**
     * Replacers for messages
     */
    replacers: ([pattern: string, replacement: string] | [pattern: string, replacement: string, flag: string])[];
    /**
     * Nameless time
     * @default 3_600_000
     */
    nameless: number;
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-tts',
  description: 'Discord text-to-speech',
  config: {
    strippers: [
      ['^[!/;=?].*', 's'], // possibly bot command
      ['```.*?```', 'gs'], // possibly program code
      ['\\|\\|.*?\\|\\|', 'gs'], // spoiler
      ['[*_`~]', 'g'], // markdown
      ['^>+ ', 'gm'], // quote
    ],
    replacers: [['https?://[!#$%&()+,./:=?@\\w~-]+', 'URL']],
    nameless: 60 * 60 * 1000,
  },
  setupGuild({ config, assistant }) {
    const replacers = [
      ...config.strippers.map(([pattern, flag]) => ({
        pattern: new RegExp(pattern, flag),
        replacement: '',
      })),
      ...config.replacers.map(([pattern, replacement, flag]) => ({
        pattern: new RegExp(pattern, flag ?? 'gi'),
        replacement,
      })),
    ];
    const prevTimes = new Map<string, number>();
    let cancelButton: MessageReaction | undefined;
    const isSpeakable = (channelId: string, member: GuildMember): boolean => {
      const current = assistant.voice;
      if (!current) return false;
      const target = assistant.data.get('guild-config')?.voiceChannels?.[current.channelId]?.input ?? 'joined';
      return (target === 'joined' && current.channelId === member.voice.channelId) || target === channelId;
    };
    const speak = (content: string, member: GuildMember, message: Message<true>, to?: string): void => {
      const currentTime = Date.now();
      const nameless = currentTime - (prevTimes.get(member.id) ?? 0) < config.nameless;
      prevTimes.set(member.id, currentTime);
      const options = { ...(assistant.data.get('guild-config')?.users?.[member.id]?.tts ?? assistant.defaultTTS) };
      if (to) {
        options.locale = isLocale(to) ? to : 'en';
        options.voice = '';
      }
      let text = content;
      for (const replacer of replacers) {
        text = text.replace(replacer.pattern, replacer.replacement);
      }
      if (!nameless || text.length === 0 || EmojiOnly.test(text)) text = `${member.displayName}, ${text}`;
      const speech = assistant.createSpeech({
        engine: {
          name: options.name,
          locale: options.locale,
        },
        request: {
          voice: options.voice,
          speed: options.speed,
          pitch: options.pitch,
          text,
        },
        message: {
          source: message,
          member,
          content,
        },
      });
      speech.once('start', async () => {
        if (speech.request.text.length < CancelableLength) return;
        cancelButton = await message.react(CancelEmoji);
      });
      speech.once('end', () => {
        if (!cancelButton) return;
        const button = cancelButton;
        cancelButton = undefined;
        button.remove().catch((error) => speech.emit('error', error));
      });
      assistant.audioPlayer.play(speech);
    };
    return {
      async onMessageCreate(message) {
        if (!assistant.audioPlayer.active) return;
        if (!message.author.bot) {
          const member = message.member ?? (await assistant.guild.members.fetch(message.author.id));
          if (!isSpeakable(message.channel.id, member)) return;
          speak(decodeMessage(message.content, message), member, message);
          return;
        }
        // for multi-clients
        const embed = message.embeds[0];
        if (!embed || !embed.url || !embed.description) return;
        const url = new URL(embed.url);
        if (url.searchParams.get('type') !== 'translation') return;
        if (url.searchParams.get('client') === assistant.guild.client.user.id) return;
        const to = url.searchParams.get('to');
        const userId = url.searchParams.get('user');
        if (!to || !userId) return;
        const member = await assistant.guild.members.fetch(userId);
        if (!isSpeakable(message.channel.id, member)) return;
        const length = embed.description.lastIndexOf('\n\n[🌐 ');
        const text = length === -1 ? embed.description : embed.description.slice(0, length);
        speak(decodeMessage(text, assistant.guild), member, message, to);
      },
      onTranslationCreate({ response, source, destination, member }) {
        if (!assistant.audioPlayer.active || !isSpeakable(destination.channel.id, member)) return;
        speak(decodeMessage(response.text, source), member, destination, response.to);
      },
      onMessageReactionAdd(reaction, user) {
        if (
          cancelButton &&
          !user.bot &&
          reaction.message === cancelButton.message &&
          reaction.emoji.name === CancelEmoji
        ) {
          assistant.audioPlayer.next();
        }
      },
      onLeave() {
        prevTimes.clear();
      },
    };
  },
};
