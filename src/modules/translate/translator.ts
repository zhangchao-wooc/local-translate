import { AIApi } from '../../api';
import type { TranslateConfig, TranslateRequestPayload, TranslateResult } from './types';

const buildPrompt = (basePrompt: string, payload: TranslateRequestPayload): string => {
  return `${basePrompt}\n\n${JSON.stringify(payload, null, 2)}`;
};

const extractLanguageAndContent = (
  response: Record<string, unknown>,
  preferredLanguage?: string,
) => {
  if (preferredLanguage) {
    const preferred = response[preferredLanguage];
    if (preferred && typeof preferred === 'object') {
      return {
        language: preferredLanguage,
        content: preferred as Record<string, unknown>,
      };
    }
  }

  for (const [language, value] of Object.entries(response)) {
    if (value && typeof value === 'object') {
      return { language, content: value as Record<string, unknown> };
    }
  }
  return { language: 'unknown', content: {} as Record<string, unknown> };
};

export const runTranslation = async (
  source: Record<string, unknown>,
  config: TranslateConfig,
  targetLanguage?: string,
): Promise<TranslateResult> => {
  const payload: TranslateRequestPayload = {
    sourceLanguage: config.file.sourceLanguage,
    ...(targetLanguage ? { targetLanguage } : {}),
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

  const extracted = extractLanguageAndContent(parsed, targetLanguage);
  return {
    language: targetLanguage || extracted.language,
    content: extracted.content,
  };
};
