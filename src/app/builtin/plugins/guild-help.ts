import { EmbedBuilder } from 'discord.js';
import { localize, omitString } from '../../utils';

export type Options = {
  command: {
    help: { type: 'guild' };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-help',
  description: 'Discord help',
  permissions: {
    help: [],
  },
  i18n: {
    en: {
      command: {
        help: {
          description: 'Show help',
          example: 'help',
          patterns: ['help'],
        },
      },
    },
    ja: {
      command: {
        help: {
          description: 'ヘルプを表示',
          example: 'ヘルプ',
          patterns: ['[ヘへ][ルる][プぷ]'],
        },
      },
    },
    'zh-CN': {
      command: {
        help: {
          description: '显示帮助',
          example: '帮助',
          patterns: ['帮助'],
        },
      },
    },
    'zh-TW': {
      command: {
        help: {
          description: '顯示幫助',
          example: '幫助',
          patterns: ['幫助'],
        },
      },
    },
  },
  setupGuild({ assistant }) {
    return {
      async commandHelp({ locale, reply }) {
        const activation = localize(assistant.activation.examples, [locale, assistant.locale], true);
        if (!activation) return false;
        const commands: Record<'id' | 'example' | 'description', string>[] = [];
        for (const { id, name, plugin } of assistant.commands.values()) {
          const command = localize(plugin.i18n, [locale, assistant.locale], true)?.command?.[name];
          if (!command) continue;
          commands.push({
            id,
            example: command.example,
            description: typeof command.description === 'string' ? command.description : command.description[0],
          });
        }
        commands.sort((a, b) => a.id.localeCompare(b.id));
        const embeds: EmbedBuilder[] = [];
        for (const command of commands) {
          let embed = embeds.at(-1);
          if (!embed || (embed.data.fields?.length ?? 0) >= 25) {
            embed = new EmbedBuilder().setColor('Blurple');
            embeds.push(embed);
          }
          let name = `\`/${command.id}\``;
          if (command.example.length > 0) name += `\n${activation}${command.example}`;
          embed.addFields({
            name: omitString(name, 250),
            value: omitString(command.description, 1000),
          });
        }
        let message = { reply };
        for (const embed of embeds) {
          message = await message.reply({ embeds: [embed] });
        }
        return true;
      },
    };
  },
};
