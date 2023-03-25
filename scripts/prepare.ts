import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const Directories = {
  secrets: join(__dirname, '../secrets/'),
  engines: join(__dirname, '../src/user/engines/'),
  plugins: join(__dirname, '../src/user/plugins/'),
  env: join(__dirname, '../src/env/'),
};

const DefaultEnv = {
  from: join(__dirname, '../examples/env/default.ts'),
  to: join(Directories.env, 'default.ts'),
};

for (const dir of Object.values(Directories)) {
  mkdirSync(dir, { recursive: true });
}

if (!existsSync(DefaultEnv.to)) {
  let env = readFileSync(DefaultEnv.from, 'utf8');
  if (process.env['DISCORD_TOKEN']) env = env.replace('token:', '// token:');
  writeFileSync(DefaultEnv.to, env, 'utf8');
}

console.log('iwassistant - prepared');
