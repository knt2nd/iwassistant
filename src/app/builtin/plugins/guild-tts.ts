import type { GuildMember, Message, MessageReaction } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { GuildAssistant } from '../../classes';
import {
  createChannelOptions,
  createRangeOptions,
  createVoiceIdOptions,
  decodeMessage,
  findVoiceIdOption,
  isLanguage,
  isLocale,
  isRegionLocale,
  parseVoiceId,
  toLanguage,
  toRegionLocales,
} from '../../utils';

// Note: Some TTS engines don't read some emojis but it should notify when someone posts a short emoji message somehow
const EmojiOnly = /^(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)$/u;

const CancelableLength = 30;

const CancelEmoji = '⏭';

function calc(id: string, at: number, digit: number, max: number): number {
  const n = Number.parseInt(id.slice(id.length - at - digit, id.length - at));
  return Math.floor((n / Math.pow(10, digit)) * (max + 1));
}

class RandomVoiceGenerator {
  #assistant: GuildAssistant;
  #cache = new Map<string, VoiceConfig<'tts'>>();

  constructor(assistant: GuildAssistant) {
    this.#assistant = assistant;
  }

  get(id: string): VoiceConfig<'tts'> {
    let config = this.#cache.get(id);
    if (!config) {
      const configs: { engine: string; locale: Locale; voice: string }[] = [];
      const locale = this.#assistant.locale;
      const locales = isLanguage(locale) ? [locale, ...toRegionLocales(locale)] : [locale];
      for (const locale of locales) {
        for (const engine of this.#assistant.engines.maps.tts.values()) {
          if (!engine.active) continue;
          for (const voice of Object.keys(engine.locales[locale] ?? {})) {
            configs.push({ engine: engine.name, locale, voice });
          }
        }
      }
      config = {
        ...(configs[calc(id, 0, 2, configs.length - 1)] ?? this.#assistant.defaultTTS),
        speed: 6 + calc(id, 2, 2, 8),
        pitch: 6 + calc(id, 4, 2, 8),
      };
      this.#cache.set(id, config);
    }
    return config;
  }

  reset(): void {
    this.#cache.clear();
  }
}

export type Options = {
  config: {
    /**
     * Strippers
     */
    strippers: [pattern: string, flag: string][];
    /**
     * Global replacers
     */
    replacers: ([pattern: string, replacement: string] | [pattern: string, replacement: string, flag: string])[];
    /**
     * I18n replacers
     */
    i18nReplacers: I18n<
      ([pattern: string, replacement: string] | [pattern: string, replacement: string, flag: string])[]
    >;
    /**
     * Nameless time
     * @default 3_600_000
     */
    nameless: number;
  };
  dict: {
    input: { type: 'simple' };
    voice: { type: 'simple' };
    speed: { type: 'simple' };
    pitch: { type: 'simple' };
    joined: { type: 'simple' };
  };
  data: {
    guild: {
      channels: Record<string, { input?: string }>;
      users: Record<string, { tts: VoiceConfig<'tts'> }>;
    };
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
    i18nReplacers: {
      ja: [
        ['iwassistant', 'イワシスタント'],
        ['ｗ', 'わら'],
      ],
    },
    nameless: 60 * 60 * 1000,
  },
  i18n: {
    en: {
      dict: {
        input: 'Text-to-Speech Input',
        voice: 'Text-to-Speech - Voice',
        speed: 'Text-to-Speech - Speed',
        pitch: 'Text-to-Speech - Pitch',
        joined: 'Joined Member Message',
      },
    },
    ja: {
      dict: {
        input: '読み上げ入力',
        voice: '読み上げ - 音声',
        speed: '読み上げ - 速さ',
        pitch: '読み上げ - 高さ',
        joined: '参加メンバーの投稿',
      },
    },
    'zh-CN': {
      dict: {
        input: '朗读输入',
        voice: '朗读 - 语音',
        speed: '朗读 - 速度',
        pitch: '朗读 - 音高',
        joined: '加入成员的信息',
      },
    },
    'zh-TW': {
      dict: {
        input: '朗讀輸入',
        voice: '朗讀 - 語音',
        speed: '朗讀 - 速度',
        pitch: '朗讀 - 音高',
        joined: '加入成員的信息',
      },
    },
  },
  setupGuild({ assistant, config, dict, data }) {
    let cancelButton: MessageReaction | undefined;
    const prevTimes = new Map<string, number>();
    const randomVoice = new RandomVoiceGenerator(assistant);
    const globalReplacers = [
      ...config.strippers.map(([pattern, flag]) => ({
        pattern: new RegExp(pattern, flag),
        replacement: '',
      })),
      ...config.replacers.map(([pattern, replacement, flag]) => ({
        pattern: new RegExp(pattern, flag ?? 'gi'),
        replacement,
      })),
    ];
    const i18nReplacers = Object.fromEntries(
      Object.entries(config.i18nReplacers).map(([locale, replacers]) => [
        locale,
        replacers.map(([pattern, replacement, flag]) => ({
          pattern: new RegExp(pattern, flag ?? 'gi'),
          replacement,
        })),
      ]),
    ) as I18n<{ pattern: RegExp; replacement: string }[]>;
    const replace = (text: string, locale: Locale): string => {
      for (const replacer of globalReplacers) {
        text = text.replace(replacer.pattern, replacer.replacement);
      }
      const localeReplacers = i18nReplacers[locale];
      if (localeReplacers) {
        for (const replacer of localeReplacers) {
          text = text.replace(replacer.pattern, replacer.replacement);
        }
      }
      if (isRegionLocale(locale)) {
        const langReplacers = i18nReplacers[toLanguage(locale)];
        if (langReplacers) {
          for (const replacer of langReplacers) {
            text = text.replace(replacer.pattern, replacer.replacement);
          }
        }
      }
      return text;
    };
    const isSpeakable = (channelId: string, member: GuildMember): boolean => {
      const current = assistant.voice;
      if (!current) return false;
      const input = data.channels?.[current.channelId]?.input;
      return input ? input === channelId : current.channelId === member.voice.channelId;
    };
    const speak = (text: string, member: GuildMember, source: Message<true>, to?: string): void => {
      const options = data.users?.[member.id]?.tts ?? randomVoice.get(member.id);
      const translating = to !== undefined;
      assistant.speak({
        engine: options.engine,
        locale: translating ? (isLocale(to) ? to : 'en') : options.locale,
        request: {
          voice: translating ? '' : options.voice,
          speed: options.speed,
          pitch: options.pitch,
          text,
        },
        message: {
          source,
          member,
          content: text,
        },
      });
    };
    return {
      beforeConfigureVoiceChannel({ fields, locale, member, channel }) {
        const subDict = dict.sub(locale);
        const channelOptions = createChannelOptions(ChannelType.GuildText, assistant.guild.channels.cache, member);
        const channelConfig = { ...data.channels?.[channel.id] };
        const update = (): void => {
          const channels = data.channels ?? {};
          channels[channel.id] = channelConfig;
          data.channels = channels;
        };
        fields.push({
          name: subDict.get('input'),
          options: [{ value: '_', label: `👤 ${subDict.get('joined')}` }, ...channelOptions],
          value: channelConfig.input ?? '_',
          update: (value) => {
            if (value === '_') {
              delete channelConfig.input;
            } else {
              channelConfig.input = value;
            }
            update();
          },
        });
      },
      beforeConfigureUser({ fields, locale, member }) {
        const subDict = dict.sub(locale);
        const voiceIdOptions = createVoiceIdOptions(assistant.engines.maps.tts);
        const userConfig = { tts: { ...randomVoice.get(member.id) }, ...data.users?.[member.id] };
        const update = (): void => {
          const users = data.users ?? {};
          users[member.id] = userConfig;
          data.users = users;
        };
        const play = (): void => {
          if (
            (assistant.voice?.channelId ?? '_') === member.voice.channelId &&
            assistant.engines.maps.tts.get(userConfig.tts.engine)?.active
          ) {
            assistant.speak({
              engine: userConfig.tts.engine,
              locale: userConfig.tts.locale,
              request: {
                voice: userConfig.tts.voice,
                speed: userConfig.tts.speed,
                pitch: userConfig.tts.pitch,
                text: `OK ${member.displayName}`,
              },
            });
          }
        };
        fields.push({
          name: subDict.get('voice'),
          options: voiceIdOptions,
          value: findVoiceIdOption(voiceIdOptions, userConfig.tts)?.value ?? '',
          update: (value) => {
            const voice = parseVoiceId(value);
            if (!voice) return false;
            userConfig.tts.engine = voice.engine;
            userConfig.tts.locale = voice.locale;
            userConfig.tts.voice = voice.voice;
            update();
            play();
            return true;
          },
        });
        fields.push({
          name: subDict.get('speed'),
          options: createRangeOptions(),
          value: userConfig.tts.speed,
          update: (value) => {
            userConfig.tts.speed = value;
            update();
            play();
          },
        });
        fields.push({
          name: subDict.get('pitch'),
          options: createRangeOptions(),
          value: userConfig.tts.pitch,
          update: (value) => {
            userConfig.tts.pitch = value;
            update();
            play();
          },
        });
      },
      beforeSpeak(speech) {
        const request = speech.request;
        if (!speech.message) {
          request.text = replace(request.text, speech.locale);
          return;
        }
        const source = speech.message.source;
        const member = speech.message.member;
        const currentTime = Date.now();
        const nameless = currentTime - (prevTimes.get(member.id) ?? 0) < config.nameless;
        prevTimes.set(member.id, currentTime);
        if (!nameless || request.text.length === 0 || EmojiOnly.test(request.text)) {
          request.text = `${member.displayName}: ${request.text}`;
        }
        request.text = replace(request.text, speech.locale);
        speech.once('start', async () => {
          if (request.text.length < CancelableLength) return;
          cancelButton = await source.react(CancelEmoji);
        });
        speech.once('end', () => {
          if (!cancelButton) return;
          const button = cancelButton;
          cancelButton = undefined;
          button.remove().catch(() => {});
        });
      },
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
        if (!embed?.url || !embed.description) return;
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
        randomVoice.reset();
      },
      onChannelDelete(channel) {
        const channels = data.channels;
        if (!channels?.[channel.id]) return;
        delete channels[channel.id];
        data.channels = channels;
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
