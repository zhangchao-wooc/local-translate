import { AIApi } from '../../api';
import type { TranslateConfig, TranslateRequestPayload, TranslateResult } from './types';

const buildPrompt = (basePrompt: string, payload: TranslateRequestPayload): string => {
  return `${basePrompt}\n\n${JSON.stringify(payload, null, 2)}`;
};

const findLanguagePayload = (response: Record<string, unknown>, targetLanguage: string) => {
  const target = response[targetLanguage];
  if (target && typeof target === 'object') return target as Record<string, unknown>;
  const first = Object.values(response).find((v) => typeof v === 'object' && v !== null);
  return (first || {}) as Record<string, unknown>;
};

export const runTranslation = async (
  source: Record<string, unknown>,
  config: TranslateConfig,
): Promise<TranslateResult> => {
  const payload: TranslateRequestPayload = {
    sourceLanguage: config.file.sourceLanguage,
    targetLanguage: config.file.targetLanguage,
    content: source,
  };

  const prompt = buildPrompt(config.prompt, payload);
  const result = await AIApi(prompt, {
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
  });

  if (!result.ok || (!result.text && !result.json)) {
    throw new Error('Translation API returned empty content');
  }

  let parsed: Record<string, unknown>;
  if (result.json) {
    parsed = result.json;
  } else {
    try {
      parsed = JSON.parse(result.text) as Record<string, unknown>;
    } catch {
      throw new Error('Translation API did not return valid JSON');
    }
  }

  return {
    language: config.file.targetLanguage,
    content: findLanguagePayload(parsed, config.file.targetLanguage),
  };
};
