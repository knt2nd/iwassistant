const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function getFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? getFiles(path) : path;
    })
    .flat();
}

const tsconfig = JSON.parse(readFileSync('./tsconfig.json', 'utf8').replace(/\/\/.*?\n/g, ''));
const options = Object.entries(tsconfig.compilerOptions).map(([k, v]) => `--${k} ${v}`);
const dtsFiles = getFiles('./src/').filter((name) => name.match(/\.d\.ts$/));

module.exports = {
  '*': 'prettier --write --ignore-unknown',
  './{src,scripts,__tests__}/**/*.ts': [
    'eslint --fix',
    `tsc --noemit ${options.join(' ')} ${dtsFiles.join(' ')}`,
    'jest --bail --passWithNoTests --findRelatedTests',
  ],
};
