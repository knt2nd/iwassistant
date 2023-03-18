interface AvailableEngines {
  'store-firestore': AvailableEngine<import('./store-firestore').Config>;
  'store-local': AvailableEngine<import('./store-local').Config>;
  'stt-google-chrome': AvailableEngine<import('./stt-google-chrome').Config>;
  'stt-google-cloud': AvailableEngine<import('./stt-google-cloud').Config>;
  'translator-google-cloud': AvailableEngine<import('./translator-google-cloud').Config>;
  'translator-google-translate': AvailableEngine<import('./translator-google-translate').Config>;
  'tts-google-cloud': AvailableEngine<import('./tts-google-cloud').Config>;
  'tts-google-translate': AvailableEngine<import('./tts-google-translate').Config>;
}
