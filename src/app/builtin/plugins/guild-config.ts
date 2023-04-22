import type {
  AnySelectMenuInteraction,
  Collection,
  GuildBasedChannel,
  GuildMember,
  TextChannel,
  VoiceChannel,
} from 'discord.js';
import { ChannelType, EmbedBuilder } from 'discord.js';
import type { GuildAssistant } from '../../classes/GuildAssistant';
import { Locales, TranslationLanguages } from '../../locales';
import { configure, isLocale, isTranslationLanguage, toLanguage, toTranslationLanguage } from '../../utils';

const ReloadCache = new Map<string, { locale: Locale; interaction: AnySelectMenuInteraction }>();

const LocalLangCache = new Map<string, { timer: NodeJS.Timeout | undefined; data: Record<string, string> }>();

const LocalLangCacheTime = 60 * 60 * 1000;

async function createTranslationOptions(engines: Map<string, ITranslator>, locale: Locale): Promise<SelectOption[]> {
  if (!isLocale(locale)) throw new Error('Invalid locale'); // just in case
  const langs = [...new Set([...engines.values()].flatMap(({ languages }) => languages)).values()].sort();
  const lang = /^zh-(TW|HK)$/.test(locale) ? 'zh-TW' : toLanguage(locale); // Taiwan and Hong Kong people prefer Traditional Chinese
  let local: Record<string, string> | undefined;
  if (lang !== 'en') {
    const cache = LocalLangCache.get(lang);
    if (cache) {
      if (cache.timer) {
        clearTimeout(cache.timer);
        cache.timer = setTimeout(() => LocalLangCache.delete(lang), LocalLangCacheTime);
      }
      local = cache.data;
    } else {
      try {
        local = (await import(`../../../../assets/json/lang/${lang}.json`)) as Record<string, string>;
        LocalLangCache.set(lang, {
          timer: setTimeout(() => LocalLangCache.delete(lang), LocalLangCacheTime),
          data: local,
        });
      } catch {
        LocalLangCache.set(lang, { timer: undefined, data: {} });
      }
    }
  }
  return langs.map((lang) => ({ value: lang, label: `${lang}: ${local?.[lang] ?? TranslationLanguages[lang]}` }));
}

function createLocaleOptions(): SelectOption[] {
  return Object.entries(Locales).map(([locale, name]) => ({ value: locale, label: `${locale}: ${name}` }));
}

function createRangeOptions(min: number, max = -1): SelectOption[] {
  const options: SelectOption[] = [];
  for (let i = min; i <= max; i++) {
    options.push({ value: `${i}`, label: `${i}` });
  }
  return options;
}

function createSwitchOptions(): SelectOption[] {
  return [
    { value: 'off', label: 'OFF' },
    { value: 'on', label: 'ON' },
  ];
}

function createTextChannelOptions(
  channels: Collection<string, GuildBasedChannel>,
  member: GuildMember,
): SelectOption[] {
  return channels
    .filter((c) => c.type === ChannelType.GuildText && c.permissionsFor(member).has('ViewChannel'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: `♯ ${c.name}` }));
}

function createVoiceOptions(engines: Map<string, { locales: VoiceLocales }>): SelectOption[] {
  const multi = engines.size > 1;
  const options: SelectOption[] = [];
  for (const [name, { locales }] of engines) {
    for (const [locale, voices] of Object.entries(locales)) {
      for (const [voice, label] of Object.entries(voices)) {
        options.push({ value: `${name}:${locale}:${voice}`, label: multi ? `${label} (${name})` : label });
      }
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

function selectVoiceOptionValue(options: SelectOption[], query: { name: string; voice: string }): string {
  const option = options.find(({ value }) => value.startsWith(`${query.name}:`) && value.endsWith(`:${query.voice}`));
  return option ? option.value : '';
}

function parseVoiceId(voiceId: string): VoiceConfig | undefined {
  const [name, locale, ...rest] = voiceId.split(':');
  const voice = rest.join(':');
  if (!name || !locale || !voice || !isLocale(locale)) return undefined;
  return { name, locale, voice };
}

function hasPermissions(
  assistant: GuildAssistant,
  member: GuildMember,
  commandName: keyof Options['command'],
): boolean {
  const permissions = assistant.attachments.get('guild-config')?.permissions[commandName] ?? [];
  if (permissions.length === 0) return true;
  return member.permissions.has(permissions);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function configureGuild(
  context: ConfigureContext,
  options: { locale: Locale; input?: { key: 'locale' | 'voice'; value: string } },
) {
  const { dict, data, assistant } = context;
  const { locale, input } = options;
  const path = `guild-config/${assistant.guild.client.user.id}/${locale}/${assistant.guild.id}/guild/self`;
  const subDict = dict.sub(locale);
  const voiceOptions = createVoiceOptions(assistant.engines.maps.tts);
  return configure({
    title: `⚙️ ${subDict.get('settings', { name: assistant.guild.name })}`,
    fields: {
      locale: {
        id: `${path}/locale`,
        name: subDict.get('language'),
        options: createLocaleOptions(),
      },
      voice: {
        id: `${path}/voice`,
        name: subDict.get('defaultVoice'),
        options: voiceOptions,
      },
    },
    data: {
      locale: data.guildLocale ?? assistant.locale,
      voice: selectVoiceOptionValue(voiceOptions, data.defaultTTS ?? assistant.defaultTTS),
    },
    input,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function configureTextChannels(
  context: ConfigureContext,
  options: { locale: Locale; channel: TextChannel; input?: { key: 'lang' | 'group'; value: string } },
) {
  const { dict, data, assistant } = context;
  const { locale, channel, input } = options;
  const path = `guild-config/${assistant.guild.client.user.id}/${locale}/${assistant.guild.id}/textChannels/${channel.id}`;
  const subDict = dict.sub(locale);
  const groupMax = Math.max(
    ...(input?.key === 'group' && /^\d+$/.test(input.value)
      ? [
          Number.parseInt(input.value),
          ...Object.entries(data.textChannels ?? {})
            .filter(([id]) => id !== channel.id)
            .map(([, opts]) => opts.group),
        ]
      : [0, ...Object.values(data.textChannels ?? {}).map((v) => v.group)]),
  );
  return configure({
    title: `♯ ${assistant.guild.name}: ${subDict.get('settings', { name: channel.name })}`,
    url: channel.url,
    fields: {
      lang: {
        id: `${path}/lang`,
        name: subDict.get('language'),
        options: await createTranslationOptions(assistant.engines.maps.translator, locale),
      },
      group: {
        id: `${path}/group`,
        name: subDict.get('multilingualGroup'),
        options: [{ value: '0', label: '-' }, ...createRangeOptions(1, groupMax + 1)],
      },
    },
    data: { lang: toTranslationLanguage(assistant.locale), group: 0, ...data.textChannels?.[channel.id] },
    input,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function configureVoiceChannels(
  context: ConfigureContext,
  options: {
    locale: Locale;
    member: GuildMember;
    channel: VoiceChannel;
    input?: { key: 'dictation' | 'stt' | 'output' | 'input' | 'join'; value: string };
  },
) {
  const { config, dict, data, assistant } = context;
  const { locale, member, channel, input } = options;
  const path = `guild-config/${assistant.guild.client.user.id}/${locale}/${assistant.guild.id}/voiceChannels/${channel.id}`;
  const subDict = dict.sub(locale);
  const savedData = data.voiceChannels?.[channel.id];
  const voiceOptions = createVoiceOptions(assistant.engines.maps.stt);
  const channelOptions = createTextChannelOptions(assistant.guild.channels.cache, member);
  return configure({
    title: `🔊 ${assistant.guild.name}: ${subDict.get('settings', { name: channel.name })}`,
    url: channel.url,
    fields: {
      dictation: {
        id: `${path}/dictation`,
        name: subDict.get('dictation'),
        options: createSwitchOptions(),
      },
      stt: {
        id: `${path}/stt`,
        name: subDict.get('sttType'),
        options: voiceOptions,
      },
      output: {
        id: `${path}/output`,
        name: subDict.get('sttOutput'),
        options: [{ value: 'self', label: `🔊 ${channel.name}` }, ...channelOptions],
      },
      input: {
        id: `${path}/input`,
        name: subDict.get('ttsInput'),
        options: [{ value: 'joined', label: `👤 ${subDict.get('joinedMemberMessage')}` }, ...channelOptions],
      },
      join: {
        id: `${path}/join`,
        name: subDict.get('autoJoin'),
        options: createSwitchOptions(),
      },
    },
    data: {
      dictation: savedData?.dictation ? 'on' : 'off',
      stt: selectVoiceOptionValue(voiceOptions, savedData?.stt ?? assistant.defaultSTT),
      output: savedData?.output ?? 'self',
      input: savedData?.input ?? 'joined',
      join: (savedData ? savedData.join : config.autoJoin) ? 'on' : 'off',
    },
    input,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function configureUsers(
  context: ConfigureContext,
  options: {
    locale: Locale;
    member: GuildMember;
    input?: { key: 'reaction' | 'voice' | 'speed' | 'pitch'; value: string };
  },
) {
  const { dict, data, assistant } = context;
  const { locale, member, input } = options;
  const path = `guild-config/${assistant.guild.client.user.id}/${locale}/${assistant.guild.id}/users/me`;
  const subDict = dict.sub(locale);
  const voiceOptions = createVoiceOptions(assistant.engines.maps.tts);
  return configure({
    title: `👤 ${assistant.guild.name}: ${subDict.get('settings', { name: member.displayName })}`,
    fields: {
      reaction: {
        id: `${path}/reaction`,
        name: subDict.get('notificationReaction'),
        options: createSwitchOptions(),
      },
      voice: {
        id: `${path}/voice`,
        name: subDict.get('ttsVoice'),
        options: voiceOptions,
      },
      speed: {
        id: `${path}/speed`,
        name: subDict.get('ttsSpeed'),
        options: createRangeOptions(0, 20),
      },
      pitch: {
        id: `${path}/pitch`,
        name: subDict.get('ttsPitch'),
        options: createRangeOptions(0, 20),
      },
    },
    data: {
      reaction: data.users?.[member.id]?.notification.reaction ? 'on' : 'off',
      voice: selectVoiceOptionValue(voiceOptions, data.users?.[member.id]?.tts ?? assistant.defaultTTS),
      speed: data.users?.[member.id]?.tts.speed ?? assistant.defaultTTS.speed,
      pitch: data.users?.[member.id]?.tts.pitch ?? assistant.defaultTTS.pitch,
    },
    input,
  });
}

type ConfigureContext = {
  config: Options['config'];
  dict: SetupContextDictionary<Options>;
  data: Partial<Options['data']['guild']>;
  assistant: GuildAssistant;
};

type SelectOption = {
  label: string;
  value: string;
};

type VoiceConfig = {
  name: string;
  locale: Locale;
  voice: string;
};

export type Options = {
  config: {
    /**
     * Auto-join default value
     * @default true
     */
    autoJoin: boolean;
  };
  command: {
    configServer: { type: 'guild' };
    configChannel: { type: 'guild' };
    configUser: { type: 'guild' };
  };
  dict: {
    settings: { type: 'simple'; options: 'name' };
    language: { type: 'simple' };
    defaultVoice: { type: 'simple' };
    guideVoiceChannel: { type: 'simple' };
    multilingualGroup: { type: 'simple' };
    dictation: { type: 'simple' };
    sttType: { type: 'simple' };
    sttOutput: { type: 'simple' };
    ttsInput: { type: 'simple' };
    autoJoin: { type: 'simple' };
    notificationReaction: { type: 'simple' };
    ttsVoice: { type: 'simple' };
    ttsSpeed: { type: 'simple' };
    ttsPitch: { type: 'simple' };
    joinedMemberMessage: { type: 'simple' };
  };
  data: {
    guild: {
      guildLocale: Locale;
      defaultTTS: VoiceConfig;
      textChannels: Record<
        string,
        {
          lang: TranslationLanguage;
          group: number;
        }
      >;
      voiceChannels: Record<
        string,
        {
          dictation: boolean;
          stt: VoiceConfig;
          output: string;
          input: string;
          join: boolean;
        }
      >;
      users: Record<
        string,
        {
          notification: { reaction: boolean };
          tts: VoiceConfig & { speed: number; pitch: number };
        }
      >;
    };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-config',
  description: 'Discord guild config',
  config: {
    autoJoin: true,
  },
  permissions: {
    configServer: ['ManageGuild'],
    configChannel: ['ManageChannels'],
    configUser: ['SendMessages'],
  },
  i18n: {
    en: {
      command: {
        configServer: {
          description: 'Server settings',
          example: 'server settings',
          patterns: ['server.*?(config|setting)'],
        },
        configChannel: {
          description: 'Text/voice channel settings',
          example: 'channel settings',
          patterns: ['channel.*?(config|setting)'],
        },
        configUser: {
          description: 'User settings',
          example: 'user settings',
          patterns: ['user.*?(config|setting)'],
        },
      },
      dict: {
        settings: "${name}'s Settings",
        language: 'Language',
        defaultVoice: 'Default Voice',
        guideVoiceChannel:
          'Tips: To configure a voice channel, run `/config-channel` in [a text chat in a voice channel](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)',
        multilingualGroup: 'Join Multilingual Group',
        dictation: 'Dictation',
        sttType: 'Voice Recognition Type',
        sttOutput: 'Voice Recognition Output',
        ttsInput: 'Text-to-Speech Input',
        autoJoin: 'Auto Join',
        notificationReaction: 'Notification - Reaction ',
        ttsVoice: 'Text-to-Speech - Voice',
        ttsSpeed: 'Text-to-Speech - Speed',
        ttsPitch: 'Text-to-Speech - Pitch',
        joinedMemberMessage: 'Joined Member Message',
      },
    },
    ja: {
      command: {
        configServer: {
          description: 'サーバー設定',
          example: 'サーバー設定',
          patterns: ['サーバー設定'],
        },
        configChannel: {
          description: 'テキスト/ボイスチャンネルの設定',
          example: 'チャンネル設定',
          patterns: ['チャンネル設定'],
        },
        configUser: {
          description: 'ユーザー設定',
          example: 'ユーザー設定',
          patterns: ['ユーザー設定'],
        },
      },
      dict: {
        settings: '${name} の設定',
        language: '言語',
        defaultVoice: 'デフォルト音声',
        guideVoiceChannel:
          'Tips: ボイスチャンネルを設定するには、[ボイスチャンネル付属のテキストチャット](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)で `/config-channel` を実行してください',
        multilingualGroup: '多言語グループに参加',
        dictation: '議事録',
        sttType: '音声認識タイプ',
        sttOutput: '音声認識出力',
        ttsInput: '読み上げ入力',
        autoJoin: '自動入室',
        notificationReaction: '通知 - リアクション',
        ttsVoice: '読み上げ - 音声',
        ttsSpeed: '読み上げ - 速さ',
        ttsPitch: '読み上げ - 高さ',
        joinedMemberMessage: '参加メンバーの投稿',
      },
    },
    'zh-CN': {
      command: {
        configServer: {
          description: '伺服器设定',
          example: '伺服器设定',
          patterns: ['伺服器设定'],
        },
        configChannel: {
          description: '文字/语音频道设定',
          example: '频道设定',
          patterns: ['频道设定'],
        },
        configUser: {
          description: '用户设定',
          example: '用户设定',
          patterns: ['用户设定'],
        },
      },
      dict: {
        settings: '${name} 的设定',
        language: '语言',
        defaultVoice: '默认语音',
        guideVoiceChannel:
          'Tips: 要配置语音频道，请在[语音频道的文本聊天](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)中运行 `/config-channel`',
        multilingualGroup: '加入多语言群',
        dictation: '听写',
        sttType: '语音识别型',
        sttOutput: '语音识别输出',
        ttsInput: '朗读输入',
        autoJoin: '自动加入',
        notificationReaction: '通知 - 反应',
        ttsVoice: '朗读 - 语音',
        ttsSpeed: '朗读 - 速度',
        ttsPitch: '朗读 - 音高',
        joinedMemberMessage: '加入成员的信息',
      },
    },
    'zh-TW': {
      command: {
        configServer: {
          description: '伺服器設定',
          example: '伺服器設定',
          patterns: ['伺服器設定'],
        },
        configChannel: {
          description: '文字/語音頻道設定',
          example: '頻道設定',
          patterns: ['頻道設定'],
        },
        configUser: {
          description: '用戶設定',
          example: '用戶設定',
          patterns: ['用戶設定'],
        },
      },
      dict: {
        settings: '${name} 的設定',
        language: '語言',
        defaultVoice: '預設語音',
        guideVoiceChannel:
          'Tips: 要配置語音頻道，請在[語音頻道的文本聊天](https://support.discord.com/hc/en-us/articles/4412085582359-Text-Channels-Text-Chat-In-Voice-Channels#h_01FMJT412WBX1MR4HDYNR8E95X)中運行 `/config-channel`',
        multilingualGroup: '加入多語言群',
        dictation: '聽寫',
        sttType: '語音識別型',
        sttOutput: '語音識別輸出',
        ttsInput: '朗讀輸入',
        autoJoin: '自動加入',
        notificationReaction: '通知 - 反應',
        ttsVoice: '朗讀 - 語音',
        ttsSpeed: '朗讀 - 速度',
        ttsPitch: '朗讀 - 音高',
        joinedMemberMessage: '加入成員的信息',
      },
    },
  },
  setupApp({ app }) {
    return {
      beforeGuildAssistantSetup(assistant) {
        const data = assistant.data.get('guild-config');
        if (!data?.guildLocale) return;
        assistant.options.locale = data.guildLocale;
      },
      async onInteractionCreate(interaction) {
        if (!app.discord.isReady() || !interaction.isStringSelectMenu() || !interaction.values[0]) return;
        if (!interaction.customId.startsWith(`guild-config/${app.discord.client.user.id}/`)) return;
        const path = interaction.customId.split('/');
        if (!path[2] || !isLocale(path[2]) || !path[3] || !path[4] || !path[5] || !path[6]) return;
        const req = { locale: path[2], guildId: path[3], target: { type: path[4], id: path[5], key: path[6] } };
        const assistant = app.discord.assistants.get(req.guildId);
        if (!assistant) return;
        const config = assistant.attachments.get('guild-config')?.config;
        const dict = assistant.dicts.get('guild-config');
        const data = assistant.data.createProperty('guild-config');
        if (!config || !dict) return;
        const context = { config, dict, data, assistant } as ConfigureContext;
        const member = await assistant.guild.members.fetch(interaction.user.id);
        const value = interaction.values[0];
        switch (req.target.type) {
          case 'guild': {
            if (!hasPermissions(assistant, member, 'configServer')) return;
            switch (req.target.key) {
              case 'locale': {
                const res = configureGuild(context, { locale: req.locale, input: { key: 'locale', value } });
                if (res.updated) {
                  if (!isLocale(value)) return;
                  data.guildLocale = value;
                  ReloadCache.set(assistant.guild.id, { locale: req.locale, interaction });
                  await interaction.update({ content: '🔄', embeds: [], components: [] });
                  await app.discord.assistants.remove(assistant.guild.id);
                  await app.discord.assistants.add(app, assistant.guild);
                } else {
                  await interaction.update(res.message);
                }
                return;
              }
              case 'voice': {
                const res = configureGuild(context, { locale: req.locale, input: { key: 'voice', value } });
                if (res.updated) {
                  const voiceConfig = parseVoiceId(value) ?? { ...assistant.defaultTTS };
                  data.defaultTTS = voiceConfig;
                  assistant.defaultTTS.name = voiceConfig.name;
                  assistant.defaultTTS.locale = voiceConfig.locale;
                  assistant.defaultTTS.voice = voiceConfig.voice;
                  if (
                    assistant.voice &&
                    assistant.voice.channelId === member.voice.channelId &&
                    assistant.engines.maps.tts.get(voiceConfig.name)?.active
                  ) {
                    assistant.speak(`OK ${member.displayName}`);
                  }
                }
                await interaction.update(res.message);
                return;
              }
              default: {
                return;
              }
            }
          }
          case 'textChannels': {
            if (!hasPermissions(assistant, member, 'configChannel')) return;
            const channel = assistant.guild.channels.cache.get(req.target.id);
            if (!channel || channel.type !== ChannelType.GuildText) return;
            switch (req.target.key) {
              case 'group':
              case 'lang': {
                const res = await configureTextChannels(context, {
                  locale: req.locale,
                  channel,
                  input: { key: req.target.key, value },
                });
                if (res.updated) {
                  const { group, lang } = res.data;
                  if (!isTranslationLanguage(lang)) return;
                  const channels = data.textChannels ?? {};
                  channels[channel.id] = { group, lang };
                  data.textChannels = channels;
                }
                await interaction.update(res.message);
                return;
              }
              default: {
                return;
              }
            }
          }
          case 'voiceChannels': {
            if (!hasPermissions(assistant, member, 'configChannel')) return;
            const channel = assistant.guild.channels.cache.get(req.target.id);
            if (!channel || channel.type !== ChannelType.GuildVoice) return;
            switch (req.target.key) {
              case 'dictation':
              case 'stt':
              case 'output':
              case 'input':
              case 'join': {
                const res = configureVoiceChannels(context, {
                  locale: req.locale,
                  channel,
                  member,
                  input: { key: req.target.key, value },
                });
                if (res.updated) {
                  const { dictation, stt, output, input, join } = res.data;
                  const voiceConfig = parseVoiceId(stt) ?? { ...assistant.defaultSTT };
                  const channels = data.voiceChannels ?? {};
                  channels[channel.id] = {
                    dictation: dictation === 'on',
                    stt: voiceConfig,
                    output,
                    input,
                    join: join === 'on',
                  };
                  data.voiceChannels = channels;
                }
                await interaction.update(res.message);
                return;
              }
              default: {
                return;
              }
            }
          }
          case 'users': {
            if (!hasPermissions(assistant, member, 'configUser')) return;
            switch (req.target.key) {
              case 'reaction':
              case 'voice':
              case 'speed':
              case 'pitch': {
                const res = configureUsers(context, {
                  locale: req.locale,
                  member,
                  input: { key: req.target.key, value },
                });
                if (res.updated) {
                  const voiceConfig = parseVoiceId(res.data.voice) ?? { ...assistant.defaultTTS };
                  const speed = res.data.speed;
                  const pitch = res.data.pitch;
                  const users = data.users ?? {};
                  users[member.id] = {
                    notification: { reaction: res.data.reaction === 'on' },
                    tts: { ...voiceConfig, speed, pitch },
                  };
                  data.users = users;
                  if (
                    req.target.key !== 'reaction' &&
                    assistant.voice &&
                    assistant.voice.channelId === member.voice.channelId &&
                    assistant.engines.maps.tts.get(voiceConfig.name)?.active
                  ) {
                    assistant.speak({
                      engine: { name: voiceConfig.name, locale: voiceConfig.locale },
                      request: { voice: voiceConfig.voice, speed, pitch, text: `OK ${member.displayName}` },
                    });
                  }
                }
                await interaction.update(res.message);
                return;
              }
              default: {
                return;
              }
            }
          }
        }
      },
    };
  },
  setupGuild({ config, dict, data, app, assistant }) {
    const context = { config, dict, data, app, assistant };
    return {
      async commandConfigServer({ locale, member }) {
        const { message } = configureGuild(context, { locale });
        await member.send(message);
      },
      async commandConfigChannel({ locale, member, channel }) {
        switch (channel.type) {
          case ChannelType.GuildText: {
            const { message } = await configureTextChannels(context, { locale, channel });
            message.embeds.unshift(new EmbedBuilder().setDescription(dict.sub(locale).get('guideVoiceChannel')));
            await member.send(message);
            return;
          }
          case ChannelType.GuildVoice: {
            const { message } = configureVoiceChannels(context, { locale, member, channel });
            await member.send(message);
            return;
          }
        }
      },
      async commandConfigUser({ locale, member }) {
        const { message } = configureUsers(context, { locale, member });
        await member.send(message);
      },
      async onReady() {
        const cache = ReloadCache.get(assistant.guild.id);
        if (cache) {
          const { message } = configureGuild(context, { locale: cache.locale });
          await cache.interaction.message.edit(message);
          ReloadCache.delete(assistant.guild.id);
        }
        if (data.defaultTTS) {
          assistant.defaultTTS.name = data.defaultTTS.name;
          assistant.defaultTTS.locale = data.defaultTTS.locale;
          assistant.defaultTTS.voice = data.defaultTTS.voice;
        }
      },
      onChannelDelete(channel) {
        switch (channel.type) {
          case ChannelType.GuildText: {
            const textChannels = data.textChannels;
            if (!textChannels?.[channel.id]) return;
            delete textChannels[channel.id];
            data.textChannels = textChannels;
            return;
          }
          case ChannelType.GuildVoice: {
            const voiceChannels = data.voiceChannels;
            if (!voiceChannels?.[channel.id]) return;
            delete voiceChannels[channel.id];
            data.voiceChannels = voiceChannels;
            return;
          }
        }
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
