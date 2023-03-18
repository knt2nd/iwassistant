export const env: Env = {
  locale: 'en',
  discord: {
    token: '__YOUR_DISCORD_TOKEN_HERE__',
    activity: {
      name: '/help',
    },
  },
  engines: {
    'store-local': true,
    'translator-google-translate': true,
    'tts-google-translate': true,
    // 'stt-google-chrome': true,
    // 'store-firestore': true,
    // 'translator-google-cloud': true,
    // 'tts-google-cloud': true,
    // 'stt-google-cloud': true,
  },
  plugins: {
    'guild-announce': true,
    'guild-config': true,
    'guild-follow': true,
    'guild-help': true,
    'guild-notify': true,
    'guild-react': true,
    'guild-stt': true,
    'guild-summon': true,
    'guild-translate': true,
    'guild-tts': true,
  },
};
