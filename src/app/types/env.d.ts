type Env = {
  /**
   * App locale
   */
  locale: Locale;
  /**
   * Discord settings
   */
  discord?: import('../classes/DiscordManager').DiscordManagerOptions;
  /**
   * Logger settings
   */
  log?: import('../classes/Logger').LoggerOptions;
  /**
   * Engine settings
   */
  engines: import('../classes/EngineManager').EngineManagerOptions;
  /**
   * Plugin settings
   */
  plugins: import('../classes/PluginManager').PluginManagerOptions;
  /**
   * Assistant settings
   */
  assistant?: import('../classes/Assistant').AssistantOptions;
  /**
   * Guild settings
   */
  guilds?: import('../classes/GuildAssistantManager').GuildAssistantManagerOptions;
  /**
   * Home settings
   */
  home?: import('../classes/HomeAssistant').HomeAssistantOptions;
};
