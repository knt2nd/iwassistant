import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isObject } from '../utils';

type ModuleBase = { name: string; description: string };

export type ModuleReport = { name: string; description: string; enabled: boolean }[];

export class ModuleLoader<Source extends ModuleBase = ModuleBase, Module extends ModuleBase = ModuleBase> {
  readonly #type: string;
  readonly #paths: string[];
  readonly #modules: Map<string, Module>;

  constructor(type: string, paths: string[]) {
    this.#type = type;
    this.#paths = paths;
    this.#modules = new Map();
  }

  get(name: string): Module | undefined {
    return this.#modules.get(name);
  }

  clear(): void {
    this.#modules.clear();
  }

  async load(converter: (source: Source) => Module): Promise<void> {
    const files: string[] = [];
    for (const path of this.#paths) {
      const dir = resolve(join(__dirname, '../../'), path);
      try {
        files.push(
          ...readdirSync(dir)
            .filter((name) => /^[a-z-]+(\.(js|ts))?$/.test(name))
            .map((name) => relative(__dirname, join(dir, name))),
        );
      } catch {
        // ignore error
      }
    }
    for (const file of files) {
      const source = ((await import(file)) as Record<string, Source>)[this.#type];
      if (
        !isObject(source) ||
        typeof source.name !== 'string' ||
        typeof source.description !== 'string' ||
        source.name.length === 0
      ) {
        throw new Error(`Invalid ${this.#type}: ${file}`);
      }
      this.#modules.set(source.name, converter(source));
    }
  }

  createReport(options: object): ModuleReport {
    const keys = new Set(Object.keys(options));
    return [...this.#modules.values()].map((module) => ({
      name: module.name,
      description: module.description,
      enabled: keys.has(module.name),
    }));
  }
}
