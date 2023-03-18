import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { sleep } from '../../../app/utils';

export type Config = {
  wait: number;
};

export const engine: IEngine<Config> = {
  name: 'tts-notifier',
  description: 'Text message notifier',
  config: {
    wait: 10,
  },
  async createTTS({ config, app }) {
    const log = app.log.createChild('TTS');
    const sounds = {
      success: await readFile(join(__dirname, '../../../../assets/ogg/beep/success.ogg')),
      failure: await readFile(join(__dirname, '../../../../assets/ogg/beep/failure.ogg')),
    };
    log.info('Start');
    return {
      active: true,
      locales: {
        en: {
          'en-success': 'en: Success sound',
          'en-failure': 'en: Failure sound',
        },
        ja: {
          'ja-success': 'ja: Success sound',
          'ja-failure': 'ja: Failure sound',
        },
      },
      async generate({ voice, speed, pitch, text }) {
        log.info(`${config.wait}, ${voice}, ${speed}, ${pitch}, ${text}`);
        await sleep(config.wait);
        const resource = new Readable({ read: () => {} });
        resource.push(voice.endsWith('success') ? sounds.success : sounds.failure);
        resource.push(null);
        return { voice, speed, pitch, text, resource };
      },
    };
  },
};
