import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const Directories = {
  secrets: join(__dirname, '../secrets/'),
  engines: join(__dirname, '../src/user/engines/'),
  plugins: join(__dirname, '../src/user/plugins/'),
  env: join(__dirname, '../src/env/'),
};

const DefaultEnv = {
  source: join(__dirname, '../examples/env/default.ts'),
  dest: join(Directories.env, 'default.ts'),
};

for (const dir of Object.values(Directories)) {
  mkdirSync(dir, { recursive: true });
}

if (!existsSync(DefaultEnv.dest)) {
  copyFileSync(DefaultEnv.source, DefaultEnv.dest);
}

console.log('iwassistant - prepared');
