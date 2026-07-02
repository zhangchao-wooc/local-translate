import { AIApi } from '../../api';
import type {
  MultiLanguageTranslateResult,
  TranslateConfig,
  TranslateRequestPayload,
  TranslateResult,
} from './types';

export type TranslationExecutionMeta = {
  mode: 'single' | 'chunked';
  chunkCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  contextWindow: number;
};

export type TranslationExecutionResult = TranslateResult & {
  meta: TranslationExecutionMeta;
};

const DEFAULT_CONTEXT_WINDOW = 16000;
const CHUNK_OVERHEAD_TOKENS = 1200;
const MIN_OUTPUT_TOKENS = 800;
const OUTPUT_TOKEN_EXPANSION_RATIO = 1.2;

const buildPrompt = (basePrompt: string, payload: TranslateRequestPayload): string => {
  return `${basePrompt}\n\n${JSON.stringify(payload, null, 2)}`;
};

const estimateTokens = (value: string): number => {
  // Use a conservative character-based estimate so chunking triggers earlier.
  return Math.ceil(value.length / 2.5);
};

const estimateContextWindow = (model?: string): number => {
  const normalized = model?.toLowerCase() || '';

  if (!normalized) return DEFAULT_CONTEXT_WINDOW;
  if (normalized.includes('gpt-4o') || normalized.includes('gpt-4.1')) return 128000;
  if (normalized.includes('claude-3') || normalized.includes('gemini-1.5')) return 128000;
  if (normalized.includes('deepseek') || normalized.includes('qwen')) return 64000;
  if (normalized.includes('mini')) return 32000;

  return DEFAULT_CONTEXT_WINDOW;
};

const buildPayload = (
  source: Record<string, unknown>,
  config: TranslateConfig,
  targetLanguage?: string,
  targetLanguages?: string[],
): TranslateRequestPayload => ({
  sourceLanguage: config.file.sourceLanguage,
  ...(targetLanguage ? { targetLanguage } : {}),
  ...(targetLanguages?.length ? { targetLanguages } : {}),
  content: source,
});

const estimateTranslationMeta = (
  source: Record<string, unknown>,
  config: TranslateConfig,
  targetLanguage?: string,
  targetLanguages?: string[],
): Omit<TranslationExecutionMeta, 'mode' | 'chunkCount'> => {
  const payload = buildPayload(source, config, targetLanguage, targetLanguages);
  const prompt = buildPrompt(config.prompt, payload);
  const estimatedInputTokens = estimateTokens(prompt);
  const outputLanguageCount = Math.max(
    1,
    targetLanguages?.length || (targetLanguage ? 1 : 1),
  );
  const estimatedOutputTokens = Math.min(
    config.max_tokens || 4000,
    Math.max(
      MIN_OUTPUT_TOKENS,
      Math.ceil(
        estimateTokens(JSON.stringify(source)) *
          OUTPUT_TOKEN_EXPANSION_RATIO *
          outputLanguageCount,
      ),
    ),
  );
  const contextWindow = estimateContextWindow(config.model);

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
    contextWindow,
  };
};

const splitSourceIntoChunks = (
  source: Record<string, unknown>,
  maxChunkInputTokens: number,
): Record<string, unknown>[] => {
  const entries = Object.entries(source);

  if (entries.length <= 1) {
    return [source];
  }

  const chunks: Record<string, unknown>[] = [];
  let currentChunk: Record<string, unknown> = {};
  let currentChunkTokens = 0;

  for (const [key, value] of entries) {
    const entry = { [key]: value };
    const entryTokens = estimateTokens(JSON.stringify(entry));

    if (
      currentChunkTokens > 0 &&
      currentChunkTokens + entryTokens > maxChunkInputTokens
    ) {
      chunks.push(currentChunk);
      currentChunk = {};
      currentChunkTokens = 0;
    }

    currentChunk[key] = value;
    currentChunkTokens += entryTokens;
  }

  if (Object.keys(currentChunk).length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
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

const parseTranslationResponse = (result: Awaited<ReturnType<typeof AIApi>>) => {
  if (!result.ok || (!result.text && !result.json)) {
    throw new Error('Translation API returned empty content');
  }

  if (result.json) return result.json;

  try {
    return JSON.parse(result.text) as Record<string, unknown>;
  } catch {
    throw new Error('Translation API did not return valid JSON');
  }
};

const extractMultiLanguageContents = (
  response: Record<string, unknown>,
  targetLanguages: string[],
): Record<string, Record<string, unknown>> => {
  const contents: Record<string, Record<string, unknown>> = {};
  const missingLanguages: string[] = [];

  for (const language of targetLanguages) {
    const value = response[language];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      contents[language] = value as Record<string, unknown>;
      continue;
    }
    missingLanguages.push(language);
  }

  if (missingLanguages.length > 0) {
    throw new Error(`Translation API response missing languages: ${missingLanguages.join(', ')}`);
  }

  return contents;
};

export const runTranslation = async (
  source: Record<string, unknown>,
  config: TranslateConfig,
  targetLanguage?: string,
): Promise<TranslateResult> => {
  const payload = buildPayload(source, config, targetLanguage);

  const prompt = buildPrompt(config.prompt, payload);
  const result = await AIApi(prompt, {
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
  });

  const parsed = parseTranslationResponse(result);

  const extracted = extractLanguageAndContent(parsed, targetLanguage);
  return {
    language: targetLanguage || extracted.language,
    content: extracted.content,
  };
};

export const runMultiLanguageTranslation = async (
  source: Record<string, unknown>,
  config: TranslateConfig,
  targetLanguages: string[],
): Promise<MultiLanguageTranslateResult> => {
  if (targetLanguages.length === 0) {
    return { contents: {} };
  }

  const payload = buildPayload(source, config, undefined, targetLanguages);
  const prompt = buildPrompt(config.prompt, payload);
  const result = await AIApi(prompt, {
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
  });
  const parsed = parseTranslationResponse(result);

  return {
    contents: extractMultiLanguageContents(parsed, targetLanguages),
  };
};

export const runTranslationAdaptive = async (
  source: Record<string, unknown>,
  config: TranslateConfig,
  targetLanguage?: string,
): Promise<TranslationExecutionResult> => {
  const baseMeta = estimateTranslationMeta(source, config, targetLanguage);
  const safeInputBudget = Math.max(
    1000,
    baseMeta.contextWindow - baseMeta.estimatedOutputTokens - CHUNK_OVERHEAD_TOKENS,
  );

  if (baseMeta.estimatedInputTokens <= safeInputBudget) {
    const result = await runTranslation(source, config, targetLanguage);
    return {
      ...result,
      meta: {
        ...baseMeta,
        mode: 'single',
        chunkCount: 1,
      },
    };
  }

  const chunks = splitSourceIntoChunks(source, Math.max(1, safeInputBudget));
  const mergedContent: Record<string, unknown> = {};

  for (const chunk of chunks) {
    const result = await runTranslation(chunk, config, targetLanguage);
    Object.assign(mergedContent, result.content);
  }

  return {
    language: targetLanguage || 'unknown',
    content: mergedContent,
    meta: {
      ...baseMeta,
      mode: 'chunked',
      chunkCount: chunks.length,
    },
  };
};

export const runMultiLanguageTranslationAdaptive = async (
  source: Record<string, unknown>,
  config: TranslateConfig,
  targetLanguages: string[],
): Promise<MultiLanguageTranslateResult & { meta: TranslationExecutionMeta }> => {
  const baseMeta = estimateTranslationMeta(
    source,
    config,
    undefined,
    targetLanguages,
  );
  const safeInputBudget = Math.max(
    1000,
    baseMeta.contextWindow - baseMeta.estimatedOutputTokens - CHUNK_OVERHEAD_TOKENS,
  );

  if (targetLanguages.length === 0) {
    return {
      contents: {},
      meta: {
        ...baseMeta,
        mode: 'single',
        chunkCount: 0,
      },
    };
  }

  if (baseMeta.estimatedInputTokens <= safeInputBudget) {
    const result = await runMultiLanguageTranslation(
      source,
      config,
      targetLanguages,
    );
    return {
      ...result,
      meta: {
        ...baseMeta,
        mode: 'single',
        chunkCount: 1,
      },
    };
  }

  const chunks = splitSourceIntoChunks(source, Math.max(1, safeInputBudget));
  const mergedContents = Object.fromEntries(
    targetLanguages.map((language) => [language, {} as Record<string, unknown>]),
  ) as Record<string, Record<string, unknown>>;

  for (const chunk of chunks) {
    const result = await runMultiLanguageTranslation(
      chunk,
      config,
      targetLanguages,
    );
    for (const language of targetLanguages) {
      Object.assign(mergedContents[language], result.contents[language]);
    }
  }

  return {
    contents: mergedContents,
    meta: {
      ...baseMeta,
      mode: 'chunked',
      chunkCount: chunks.length,
    },
  };
};
