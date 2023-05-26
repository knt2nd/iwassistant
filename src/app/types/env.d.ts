type Env = {
  /**
   * App locale
   */
  locale: Locale;
  /**
   * Discord settings
   */
  discord?: import('../classes').DiscordManagerOptions;
  /**
   * Logger settings
   */
  log?: import('../classes').LoggerOptions;
  /**
   * Engine settings
   */
  engines: import('../classes').EngineManagerOptions;
  /**
   * Plugin settings
   */
  plugins: import('../classes').PluginManagerOptions;
  /**
   * Assistant settings
   */
  assistant?: import('../classes').AssistantOptions;
  /**
   * Guild settings
   */
  guilds?: Exclude<import('../classes').GuildAssistantMangerOptions['guilds'], undefined>;
  /**
   * Home settings
   */
  home?: import('../classes').HomeAssistantOptions;
};
