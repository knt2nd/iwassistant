import { I18nDictionary } from '../../src/app/classes';

const fixture = {
  en: {
    simple: 'Hello',
    simpleParam: '${greetings}, ${name}.',
    random: ['Hello', 'Hi'],
    randomParam: ['Hello, ${name}.', 'Hi, ${name}.'],
  },
  ja: {
    simple: 'こんにちは',
    simpleParam: '${greetings}、${name}。',
    random: ['こんにちは', 'おはよう'],
    randomParam: ['こんにちは、${name}。', 'おはよう、${name}。'],
  },
};

describe('I18nDictionary', () => {
  test('en', () => {
    const dict = new I18nDictionary('en', fixture);
    expect(dict.locale).toBe('en');
    expect(dict.locales).toEqual(['en', 'ja']);
    expect(dict.get('simple')).toBe('Hello');
    expect(dict.get('simpleParam', { greetings: 'Hi', name: 'World' })).toBe('Hi, World.');
    expect(dict.get('random')).toMatch(/^(Hello|Hi)$/);
    expect(dict.get('randomParam', { name: 'World' })).toMatch(/^(Hello|Hi), World\.$/);
  });

  test('ja', () => {
    const dict = new I18nDictionary('ja', fixture);
    expect(dict.locale).toBe('ja');
    expect(dict.locales).toEqual(['en', 'ja']);
    expect(dict.get('simple')).toBe('こんにちは');
    expect(dict.get('simpleParam', { greetings: 'こんにちは', name: '世界' })).toBe('こんにちは、世界。');
    expect(dict.get('random')).toMatch(/^(こんにちは|おはよう)$/);
    expect(dict.get('randomParam', { name: '世界' })).toMatch(/^(こんにちは|おはよう)、世界。$/);
  });

  test('sub locale', () => {
    const dictEn = new I18nDictionary('en', fixture);
    expect(dictEn.locale).toBe('en');
    expect(dictEn.locales).toEqual(['en', 'ja']);
    expect(dictEn.get('simple')).toBe('Hello');
    const dictJa = dictEn.sub('ja');
    expect(dictJa.locale).toBe('ja');
    expect(dictJa.locales).toEqual(['en', 'ja']);
    expect(dictJa.get('simple')).toBe('こんにちは');
  });

  test('sub locale but no locale', () => {
    const dictEn = new I18nDictionary('en', {});
    expect(dictEn.locale).toBe('en');
    const dictJa = dictEn.sub('ja');
    expect(dictJa.locale).toBe('en');
  });

  test('no locale fallbacks to the first locale', () => {
    const dict = new I18nDictionary('zh', { ja: { sample: 'こんにちは' } });
    expect(dict.locale).toBe('ja');
    expect(dict.get('sample')).toBe('こんにちは');
  });

  test('no locale fallbacks but no locale', () => {
    const dict = new I18nDictionary('zh', {});
    expect(dict.locale).toBe('zh');
    expect(dict.get('sample')).toBe('');
  });

  test('region locale fallbacks to its language', () => {
    const dict = new I18nDictionary('en-GB', {
      zh: { sample: ['你好'] },
      'zh-TW': { sample: ['哈囉'] },
      en: { sample: ['Hello'] },
    });
    expect(dict.locale).toBe('en');
    expect(dict.get('sample')).toBe('Hello');
  });

  test('region locale fallbacks but no its language', () => {
    const dict = new I18nDictionary('en-GB', { ja: { sample: 'こんにちは' } });
    expect(dict.locale).toBe('ja');
    expect(dict.get('sample')).toBe('こんにちは');
  });

  test('region locale fallbacks but no its language, nor the first locale', () => {
    const dict = new I18nDictionary('en-GB', {});
    expect(dict.locale).toBe('en-GB');
    expect(dict.get('sample')).toBe('');
  });

  test('region locale fallbacks to its first locale', () => {
    const dict = new I18nDictionary('en-CA', {
      'en-GB': { sample: 'colour' },
      'en-US': { sample: 'color' },
    });
    expect(dict.locale).toBe('en-GB');
    expect(dict.get('sample')).toBe('colour');
  });

  test('zh-HK fallbacks to zh-TW, if exists', () => {
    const dict = new I18nDictionary('zh-HK', {
      zh: { sample: '字体' },
      'zh-CN': { sample: '字体' },
      'zh-TW': { sample: '字體' },
    });
    expect(dict.locale).toBe('zh-TW');
    expect(dict.get('sample')).toBe('字體');
  });

  test('language fallbacks to its first locale', () => {
    const dict = new I18nDictionary('en', {
      'en-GB': { sample: 'colour' },
      'en-US': { sample: 'color' },
    });
    expect(dict.locale).toBe('en-GB');
    expect(dict.get('sample')).toBe('colour');
  });

  test('random but empty array', () => {
    const dict = new I18nDictionary('en', { en: { sample: [] } });
    expect(dict.get('sample')).toBe('');
  });

  test('various params', () => {
    class UserClass {
      toString = (): string => 'user';
    }
    const sample =
      '${var}, ${var}, ${VAR}, ${V_A-R}, ${_1}, ${array}, ${user}, ${012}, ${!A}, ${#A}, ${$A}, ${漢字}, ${한글}, ${${}}, ${${a}}, ${${}, ${}, ${, end.';
    const dict = new I18nDictionary('en', { en: { sample } });
    expect(
      dict.get('sample', {
        var: 'str',
        VAR: 123,
        'V_A-R': true,
        _1: {},
        array: [1, 2],
        user: new UserClass(),
        '012': '0',
        '!A': '!',
        '#A': '#',
        $A: '$',
        漢字: '鰯',
        한글: '정어리',
        '${': ':)',
        '${}': 'Fail 1',
        '${a}': 'Fail 2',
      }),
    ).toBe('str, str, 123, true, [object Object], 1,2, user, 0, !, #, $, 鰯, 정어리, :)}, }, :), ${}, ${, end.');
  });
});
