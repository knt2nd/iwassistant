import { formatDate, sleep } from '../../../app/utils';

export type Options = {
  config: {
    prefix: string;
    wait: number;
  };
  data: {
    guild: {
      startedAt: string; // saved in 60s
      _count: number; // saved when the app halted
    };
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-echo',
  description: 'Discord text/voice message echo',
  config: {
    prefix: 'OK ',
    wait: 1000,
  },
  setupApp() {
    return {
      beforeGuildAssistantSetup(_, optionsList) {
        // force the settings, meaning ignore the env settings
        optionsList.push({
          // no abort, always transcribe all
          'guild-stt': {
            config: {
              command: true,
              timeout: 0,
            },
          },
        });
      },
    };
  },
  setupGuild({ config, data, assistant }) {
    const log = assistant.log.createChild('ECHO');
    let count = data._count ?? 0;
    data.startedAt = formatDate();
    return {
      async onMessageCreate(message) {
        if (message.author.bot) return;
        const text = config.prefix + message.content;
        log.debug?.(`Wait: ${config.wait}`);
        await sleep(config.wait);
        await message.channel.sendTyping();
        log.debug?.(`Wait: ${text.length * 50}`);
        await sleep(text.length * 50);
        await message.reply(text);
        data._count = ++count;
        log.info(`Text(${count}): ${text}`);
      },
      beforeTranscribe(request) {
        request.audio.once('end', async () => {
          const text = config.prefix + request.audio.transcript;
          log.debug?.(`Wait: ${config.wait}`);
          await sleep(config.wait);
          assistant.speak(text);
          data._count = ++count;
          log.info(`Voice(${count}): ${text}`);
        });
      },
    };
  },
};
