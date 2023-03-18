export type Options = {
  config: {
    pong: string;
  };
};

export const plugin: IPlugin<Options> = {
  name: 'guild-ping',
  description: 'Discord ping/pong message',
  config: {
    pong: 'pong',
  },
  setupGuild({ config }) {
    return {
      async onMessageCreate(message) {
        if (message.content === 'ping') await message.reply(config.pong);
      },
    };
  },
};
