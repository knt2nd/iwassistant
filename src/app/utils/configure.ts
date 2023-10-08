import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';

const PageSize = 23;

type Field = {
  id: string;
  name: string;
  options: { label: string; value: string }[];
  disabled?: boolean;
  value: string;
  page?: number;
};

export function configure<
  T extends Record<string, Omit<Field, 'value' | 'page'>>,
  U extends Record<keyof T, string | number>,
>({
  title,
  url,
  fields,
  data,
  input,
}: {
  title?: string;
  url?: string;
  fields: T;
  data: U;
  input: { key: keyof T; value: string } | undefined;
}): {
  message: {
    content: string;
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<StringSelectMenuBuilder>[];
  };
  data: U;
  updated: boolean;
} {
  let updated = false;
  const msgFields = Object.fromEntries(
    Object.entries(fields as Record<string, object>).map(([k, v]) => [k, { ...v, value: `${data[k as keyof T]}` }]),
  ) as Record<keyof T, Field>;
  if (input) {
    const matched = input.value.match(/^__(\d+)__$/);
    if (matched?.[1] === undefined) {
      msgFields[input.key].value = input.value;
      const isNumber = typeof data[input.key] === 'number';
      data[input.key] = (isNumber ? Number.parseInt(input.value) : input.value) as U[keyof T];
      updated = true;
    } else {
      msgFields[input.key].page = Number.parseInt(matched[1]);
    }
  }
  const embed = new EmbedBuilder().setColor('Blurple');
  if (title) {
    embed.setTitle(title);
    if (url) embed.setURL(url);
  }
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  for (const field of Object.values(msgFields as Record<string, Field>)) {
    const last = Math.floor((field.options.length - 1) / PageSize);
    let page = field.page ?? Math.floor(field.options.findIndex(({ value }) => field.value === value) / PageSize);
    if (page < 0 || page > last) page = 0;
    const options = field.options.slice(page * PageSize, (page + 1) * PageSize);
    if (page > 0) options.unshift({ value: `__${page - 1}__`, label: `<< ${page + 1}/${last + 1}` });
    if (page < last) options.push({ value: `__${page + 1}__`, label: `${page + 1}/${last + 1} >>` });
    const select = new StringSelectMenuBuilder()
      .setCustomId(field.id)
      .setOptions(options.map((opt) => (field.value === opt.value ? { ...opt, default: true } : opt)));
    if (select.options.length === 0) {
      select.setDisabled().setOptions([{ value: '-', label: '-', default: true }]);
    } else if (field.disabled) {
      select.setDisabled();
    }
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().setComponents(select));
    embed.addFields({ name: field.name, value: field.options.find((opt) => opt.value === field.value)?.label ?? '-' });
  }
  return { message: { content: '', embeds: [embed], components: rows }, data, updated };
}
