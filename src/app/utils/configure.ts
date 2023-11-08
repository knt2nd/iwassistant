import type {
  APIEmbedField,
  AwaitMessageCollectorOptionsParams,
  BaseMessageOptions,
  Message,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { ActionRowBuilder, ComponentType, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';

const ListenerOptions: AwaitMessageCollectorOptionsParams<ComponentType.StringSelect> = {
  time: 10 * 60 * 1000,
  componentType: ComponentType.StringSelect,
};

const PageSize = 23;

const RowSize = 5;

type Row = {
  id: string;
  header: APIEmbedField;
  select: StringSelectMenuBuilder;
};

type Field = Required<ConfigField> & {
  id: string;
};

type MessageModifier = (message: BaseMessageOptions, page: number) => BaseMessageOptions;

export type ConfigureOptions = {
  title?: string;
  user: User;
  timeout?: number;
  fieldsGenerator: () => Awaitable<ConfigField[]>;
  messageModifier?: MessageModifier;
  errorHandler?: ErrorHandler;
};

class Chunk {
  #title?: string;
  #page = 0;
  #rows: Row[] = [];
  #modifier?: MessageModifier;
  constructor(options: { title?: string | undefined; modifier?: MessageModifier | undefined }) {
    if (options.title) this.#title = options.title;
    if (options.modifier) this.#modifier = options.modifier;
  }
  get message(): BaseMessageOptions {
    const embed = new EmbedBuilder().setColor('Blurple');
    const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
    if (this.#title) embed.setTitle(this.#page > 0 ? `${this.#title} #${this.#page}` : this.#title);
    for (const row of this.#rows) {
      embed.addFields(row.header);
      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().setComponents(row.select));
    }
    const message = { content: '', embeds: [embed], components };
    return this.#modifier ? this.#modifier(message, this.#page) : message;
  }
  setPage(page: number): void {
    this.#page = page;
  }
  has(id: string): boolean {
    return this.#rows.some((r) => r.id === id);
  }
  get(id: string): Row | undefined {
    return this.#rows.find((r) => r.id === id);
  }
  add(row: Row): void {
    if (!this.isFull()) this.#rows.push(row);
  }
  isFull(): boolean {
    return this.#rows.length >= RowSize;
  }
}

function createSelect(field: Field, page: number): StringSelectMenuBuilder {
  const last = Math.floor((field.options.length - 1) / PageSize);
  if (page < 0 || page > last) page = 0;
  const options = field.options.slice(page * PageSize, (page + 1) * PageSize);
  if (page > 0) options.unshift({ value: `__${page - 1}__`, label: `<< ${page + 1}/${last + 1}` });
  if (page < last) options.push({ value: `__${page + 1}__`, label: `${page + 1}/${last + 1} >>` });
  const select = new StringSelectMenuBuilder();
  select.setCustomId(field.id);
  select.setOptions(options.map((o) => ({ value: `${o.value}`, label: o.label, default: field.value === o.value })));
  if (select.options.length === 0) {
    select.setDisabled().setOptions([{ value: '-', label: '-', default: true }]);
  } else if (field.disabled) {
    select.setDisabled();
  }
  return select;
}

function createGenerator(options: ConfigureOptions): () => Promise<{ fields: Field[]; chunks: Chunk[] }> {
  const prefix = `configure-${options.user.client.user.id}-${options.user.id}-${Math.random().toString(36).slice(-8)}`;
  return async (): Promise<{ fields: Field[]; chunks: Chunk[] }> => {
    const rawFields = await options.fieldsGenerator();
    const fields: Field[] = rawFields.map((f, i) => ({
      id: `${prefix}-${i}`,
      name: f.name,
      options: f.options,
      value: f.value,
      disabled: !!f.disabled,
      order: f.order ?? 0,
      update: f.update,
    }));
    fields.sort((a, b) => a.order - b.order);
    const rows: Row[] = fields.map((f) => ({
      id: f.id,
      header: { name: f.name, value: f.options.find((o) => o.value === f.value)?.label ?? '-' },
      select: createSelect(f, Math.floor(f.options.findIndex((o) => o.value === f.value) / PageSize)),
    }));
    const chunks: Chunk[] = [];
    let chunk: Chunk | undefined;
    for (const row of rows) {
      if (!chunk) {
        chunk = new Chunk({ title: options.title, modifier: options.messageModifier });
        chunks.push(chunk);
      }
      chunk.add(row);
      if (chunk.isFull()) chunk = undefined;
    }
    if (chunks.length > 1) {
      for (const [i, chunk] of chunks.entries()) {
        chunk.setPage(i + 1);
      }
    }
    return { fields, chunks };
  };
}

export async function configure(options: ConfigureOptions): Promise<void> {
  const generate = createGenerator(options);
  let current = await generate();
  if (current.chunks.length === 0) return;
  const messages: Message[] = [];
  for (const chunk of current.chunks) {
    messages.push(await options.user.send(chunk.message));
  }
  const clearMessages = async (): Promise<void> => {
    for (const message of messages) {
      await message.delete();
    }
    messages.length = 0;
  };
  const listenerOpts = { ...ListenerOptions };
  if (options.timeout) listenerOpts.time = options.timeout;
  const startListening = (): void => {
    Promise.race(messages.map(async (m) => m.awaitMessageComponent(listenerOpts)))
      .then((interaction) => {
        onInteract(interaction).catch((error) => {
          options.errorHandler?.(error);
          setTimeout(() => void clearMessages().catch(() => {}), 10_000);
        });
      })
      .catch(() => {
        clearMessages().catch(() => {});
      });
  };
  const onInteract = async (interaction: StringSelectMenuInteraction): Promise<void> => {
    const value = interaction.values[0];
    const field = current.fields.find((f) => f.id === interaction.customId);
    if (!value || !field) throw new Error('No field');
    const matched = value.match(/^__(\d+)__$/);
    if (matched?.[1] !== undefined) {
      const page = Number.parseInt(matched[1]);
      const chunk = current.chunks.find((c) => c.has(field.id));
      if (!chunk) throw new Error('No chunk');
      const row = chunk.get(field.id);
      if (!row) throw new Error('No row');
      row.select = createSelect(field, page);
      await interaction.update(chunk.message);
      startListening();
      return;
    }
    let typedValue: ConfigValueType | undefined;
    switch (typeof field.value) {
      case 'number': {
        typedValue = Number.parseInt(value);
        break;
      }
      case 'boolean': {
        typedValue = value === 'true';
        break;
      }
      default: {
        typedValue = value;
      }
    }
    const result = await field.update(typedValue, interaction);
    if (result === false) throw new Error(`Unable to configure: ${options.title} - ${field.name} -> ${value}`);
    current = await generate();
    if (current.chunks.length === messages.length) {
      for (const [i, chunk] of current.chunks.entries()) {
        const message = messages[i]!;
        await (message.id === interaction.message.id ? interaction.update(chunk.message) : message.edit(chunk.message));
      }
      startListening();
      return;
    }
    await clearMessages();
    for (const chunk of current.chunks) {
      messages.push(await options.user.send(chunk.message));
    }
    startListening();
  };
  startListening();
}
