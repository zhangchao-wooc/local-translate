export type LanguageOption = {
  label: string;
  value: string;
};

export const LanguageList: LanguageOption[] = [
  { label: 'English (United States)', value: 'en-US' },
  { label: 'English (United Kingdom)', value: 'en-GB' },
  { label: 'English (Australia)', value: 'en-AU' },
  { label: 'Chinese (Simplified, China)', value: 'zh-CN' },
  { label: 'Chinese (Simplified, Singapore)', value: 'zh-SG' },
  { label: 'Chinese (Traditional, Taiwan)', value: 'zh-TW' },
  { label: 'Chinese (Traditional, Hong Kong)', value: 'zh-HK' },
  { label: 'Chinese (Traditional, Macao)', value: 'zh-MO' },
  { label: 'Japanese (Japan)', value: 'ja-JP' },
  { label: 'Korean (Korea)', value: 'ko-KR' },
  { label: 'French (France)', value: 'fr-FR' },
  { label: 'French (Canada)', value: 'fr-CA' },
  { label: 'German (Germany)', value: 'de-DE' },
  { label: 'Spanish (Spain)', value: 'es-ES' },
  { label: 'Spanish (Mexico)', value: 'es-MX' },
  { label: 'Portuguese (Brazil)', value: 'pt-BR' },
  { label: 'Portuguese (Portugal)', value: 'pt-PT' },
  { label: 'Italian (Italy)', value: 'it-IT' },
  { label: 'Dutch (Netherlands)', value: 'nl-NL' },
  { label: 'Russian (Russia)', value: 'ru-RU' },
  { label: 'Ukrainian (Ukraine)', value: 'uk-UA' },
  { label: 'Polish (Poland)', value: 'pl-PL' },
  { label: 'Turkish (Turkey)', value: 'tr-TR' },
  { label: 'Arabic (Saudi Arabia)', value: 'ar-SA' },
  { label: 'Thai (Thailand)', value: 'th-TH' },
  { label: 'Vietnamese (Vietnam)', value: 'vi-VN' },
  { label: 'Indonesian (Indonesia)', value: 'id-ID' },
  { label: 'Hindi (India)', value: 'hi-IN' },
  { label: 'Czech (Czechia)', value: 'cs-CZ' },
  { label: 'Danish (Denmark)', value: 'da-DK' },
  { label: 'Finnish (Finland)', value: 'fi-FI' },
  { label: 'Swedish (Sweden)', value: 'sv-SE' },
  { label: 'Norwegian Bokmal (Norway)', value: 'nb-NO' },
  { label: 'Hungarian (Hungary)', value: 'hu-HU' },
  { label: 'Romanian (Romania)', value: 'ro-RO' },
  { label: 'Bulgarian (Bulgaria)', value: 'bg-BG' },
  { label: 'Croatian (Croatia)', value: 'hr-HR' },
  { label: 'Slovak (Slovakia)', value: 'sk-SK' },
  { label: 'Greek (Greece)', value: 'el-GR' },
];

export const DEFAULT_LANGUAGE_FILE_NAME_MAP: Record<string, string> = Object.fromEntries(
  LanguageList.map((item) => [item.value, item.value]),
);
