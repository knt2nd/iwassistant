import { createLocaleOptions, createVoiceIdOptions, findVoiceIdOption, isLocale, parseVoiceId } from '../../utils';

export type Options = {
  dict: {
    lang: { type: 'simple' };
    voice: { type: 'simple' };
  };
  data: {
    guild: {
      locale: Locale;
      tts: VoiceConfig;
    };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-default',
  description: 'Discord guild default settings',
  i18n: {
    en: {
      dict: {
        lang: 'Language',
        voice: 'Default Voice',
      },
    },
    ja: {
      dict: {
        lang: '言語',
        voice: 'デフォルト音声',
      },
    },
    'zh-CN': {
      dict: {
        lang: '语言',
        voice: '默认语音',
      },
    },
    'zh-TW': {
      dict: {
        lang: '語言',
        voice: '預設語音',
      },
    },
  },
  setupApp() {
    return {
      beforeGuildSetup(assistant) {
        const data = assistant.data.get('guild-default');
        if (!data) return;
        if (data.locale) {
          assistant.locale = data.locale;
        }
        if (data.tts) {
          assistant.defaultTTS.engine = data.tts.engine;
          assistant.defaultTTS.locale = data.tts.locale;
          assistant.defaultTTS.voice = data.tts.voice;
        }
      },
    };
  },
  setupGuild({ app, assistant, dict, data }) {
    return {
      beforeConfigureGuild({ fields, locale, member }) {
        const latest = app.discord.assistants.get(assistant.guild.id);
        if (!latest) return;
        assistant = latest;
        data = assistant.data.createProperty('guild-default');
        const subDict = dict.sub(locale);
        const voiceIdOptions = createVoiceIdOptions(assistant.engines.maps.tts);
        fields.push({
          name: subDict.get('lang'),
          options: createLocaleOptions(),
          value: data.locale ?? assistant.locale,
          update: async (value, interaction) => {
            if (!isLocale(value)) return false;
            data.locale = value;
            delete data.tts;
            await interaction.message.edit({ content: '🔄', embeds: [], components: [] });
            await app.discord.assistants.remove(assistant.guild.id);
            await app.discord.assistants.add(app, assistant.guild);
            return true;
          },
        });
        fields.push({
          name: subDict.get('voice'),
          options: voiceIdOptions,
          value: findVoiceIdOption(voiceIdOptions, data.tts ?? assistant.defaultTTS)?.value ?? '',
          update: (value) => {
            const voice = parseVoiceId(value);
            if (!voice) return false;
            data.tts = voice;
            assistant.defaultTTS.engine = voice.engine;
            assistant.defaultTTS.locale = voice.locale;
            assistant.defaultTTS.voice = voice.voice;
            if (
              (assistant.voice?.channelId ?? '_') === member.voice.channelId &&
              assistant.engines.maps.tts.get(voice.engine)?.active
            ) {
              assistant.speak(`OK ${member.displayName}`);
            }
            return true;
          },
        });
      },
    };
  },
};
