import type { GuildMember, Message } from 'discord.js';
import { ChannelType, EmbedBuilder } from 'discord.js';
import {
  createRangeOptions,
  createTranslationLanguageOptions,
  decodeMessage,
  isTranslationLanguage,
  omitString,
  toTranslationLanguage,
} from '../../utils';

const EmojiPattern = /<(a?):(\w{2,32}):(\d{17,20})>/g;

export type Options = {
  config: {
    /**
     * Show original text
     * @default true
     */
    original: boolean;
    /**
     * Link to original message
     * @default true
     */
    link: boolean;
    /**
     * Nameless time
     * @default 300_000
     */
    nameless: number;
  };
  dict: {
    lang: { type: 'simple' };
    group: { type: 'simple' };
  };
  data: {
    guild: {
      channels: Record<string, { lang: TranslationLanguage; group: number }>;
    };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-translate',
  description: 'Discord message translator',
  config: {
    original: true,
    link: true,
    nameless: 300_000,
  },
  i18n: {
    en: {
      dict: {
        lang: 'Language',
        group: 'Join Multilingual Group',
      },
    },
    ja: {
      dict: {
        lang: '言語',
        group: '多言語グループに参加',
      },
    },
    'zh-CN': {
      dict: {
        lang: '语言',
        group: '加入多语言群',
      },
    },
    'zh-TW': {
      dict: {
        lang: '語言',
        group: '加入多語言群',
      },
    },
  },
  setupGuild({ assistant, config, dict, data }) {
    let prevTranslations: Map<string, { userId: string; timer: NodeJS.Timeout }> | undefined;
    const deletePrevTranslation = (channelId: string): void => {
      if (!prevTranslations) return;
      prevTranslations.delete(channelId);
      if (prevTranslations.size === 0) prevTranslations = undefined;
    };
    const translate = async (text: string, source: Message<true>, member?: GuildMember): Promise<void> => {
      const allChannelConfigs = data.channels;
      const channelConfig = allChannelConfigs?.[source.channel.id];
      if (!channelConfig || channelConfig.group === 0) return;
      if (!member) member = source.member ?? (await assistant.guild.members.fetch(source.author.id));
      const from = channelConfig.lang;
      const targets = Object.entries(allChannelConfigs)
        .filter(([id, opts]) => opts.group === channelConfig.group && id !== source.channel.id && opts.lang !== from)
        .map(([id, { lang }]) => ({ channel: assistant.guild.channels.cache.get(id), lang }));
      const promises: Promise<void>[] = [];
      for (const { channel, lang } of targets) {
        if (!channel || channel.type !== ChannelType.GuildText) continue;
        let nameless = false;
        if (config.nameless > 0) {
          if (!prevTranslations) prevTranslations = new Map();
          const prev = prevTranslations.get(channel.id);
          if (prev) {
            if (prev.userId === member.id) nameless = true;
            clearTimeout(prev.timer);
          }
          prevTranslations.set(channel.id, {
            userId: member.id,
            timer: setTimeout(() => deletePrevTranslation(channel.id), config.nameless),
          });
        }
        promises.push(
          (async (): Promise<void> => {
            const emojis: Record<string, [animated: string, id: string]> = {};
            const req: TranslatorRequest = {
              from,
              to: lang,
              text: text.replaceAll(EmojiPattern, (_, animated: string, name: string, id: string) => {
                if (!emojis[id]) emojis[id] = [animated, name];
                return `<::${id}>`; // to avoid to translate custom emoji names
              }),
            };
            const res = await assistant.translate(req);
            if (Object.keys(emojis).length > 0) {
              for (const [id, [animated, name]] of Object.entries(emojis)) {
                res.text = res.text.replaceAll(`<::${id}>`, `<${animated}:${name}:${id}>`); // restore emojis
              }
              res.text = res.text.replace(/<::\d+>/, ''); // remove replacements, just in case
            }
            const content = config.link ? omitString(res.text, 3900) : omitString(res.text, 4000);
            const url = new URL(source.url);
            url.searchParams.set('type', 'translation');
            url.searchParams.set('client', assistant.guild.client.user.id);
            url.searchParams.set('from', res.from);
            url.searchParams.set('to', res.to);
            url.searchParams.set('user', member.id);
            const embed = new EmbedBuilder()
              .setURL(url.toString())
              .setDescription(config.link ? `${content}\n\n[🌐 ${res.from}:${res.to}](${source.url})` : content);
            if (!nameless) embed.setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() });
            if (config.original) embed.setFooter({ text: omitString(decodeMessage(text, source), 1000) });
            const destination = await channel.send({ embeds: [embed] });
            assistant.emit('translationCreate', { request: req, response: res, source, destination, member });
          })(),
        );
      }
      for (const res of await Promise.allSettled(promises)) {
        if (res.status === 'rejected') assistant.log.error(res.reason);
      }
    };
    return {
      beforeConfigureTextChannel({ fields, locale, channel }) {
        const subDict = dict.sub(locale);
        const groupMax = Math.max(0, ...Object.values(data.channels ?? {}).map((c) => c.group));
        const channelConfig = {
          lang: toTranslationLanguage(assistant.locale),
          group: 0,
          ...data.channels?.[channel.id],
        };
        const update = (): void => {
          const channels = data.channels ?? {};
          channels[channel.id] = channelConfig;
          data.channels = channels;
        };
        fields.push({
          name: subDict.get('lang'),
          options: createTranslationLanguageOptions(assistant.engines.maps.translator, locale),
          value: channelConfig.lang,
          update: (value) => {
            if (!isTranslationLanguage(value)) return false;
            channelConfig.lang = value;
            update();
            return true;
          },
        });
        fields.push({
          name: subDict.get('group'),
          options: [{ value: 0, label: '-' }, ...createRangeOptions({ max: groupMax + 1 })],
          value: channelConfig.group,
          update: (value) => {
            channelConfig.group = value;
            update();
          },
        });
      },
      async onMessageCreate(message) {
        if (
          prevTranslations &&
          message.author.id !== assistant.self.id &&
          prevTranslations.get(message.channel.id)?.userId !== message.author.id
        ) {
          deletePrevTranslation(message.channel.id);
        }
        if (!message.author.bot) {
          if (message.content.length > 0) await translate(message.content, message);
          return;
        }
        // for multi-clients
        const embed = message.embeds[0];
        if (!embed?.url || !embed.description) return;
        const url = new URL(embed.url);
        if (url.searchParams.get('type') !== 'dictation') return;
        if (url.searchParams.get('client') === assistant.guild.client.user.id) return;
        const userId = url.searchParams.get('user');
        if (!userId) return;
        const member = await assistant.guild.members.fetch(userId);
        await translate(embed.description, message, member);
      },
      async onDictationCreate({ source, destination, member }) {
        await translate(source.transcript, destination, member);
      },
      onChannelDelete(channel) {
        const channels = data.channels;
        if (!channels?.[channel.id]) return;
        delete channels[channel.id];
        data.channels = channels;
      },
    };
  },
};
