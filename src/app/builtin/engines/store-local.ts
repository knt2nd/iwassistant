import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type Config = {
  /**
   * Sub directory name to store
   * @default "1"
   */
  id: string;
};

export const engine: IEngine<Config> = {
  name: 'store-local',
  description: 'Local JSON store',
  config: {
    id: '1',
  },
  async createStore({ config }) {
    const dir = join(__dirname, '../../../../tmp/store/', config.id);
    const lock: Record<string, true> = {};
    await mkdir(dir, { recursive: true });
    return {
      async get(key) {
        let json: string;
        try {
          json = await readFile(join(dir, `${key}.json`), 'utf8');
        } catch {
          return;
        }
        return JSON.parse(json) as BasicObject;
      },
      async set(key, value) {
        if (lock[key]) return false; // easy lock (no retry)
        lock[key] = true;
        await writeFile(join(dir, `${key}.json`), JSON.stringify(value, undefined, 2));
        delete lock[key];
        return true;
      },
    };
  },
};
