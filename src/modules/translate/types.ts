import type { OutputFileFormat } from '../../common/file-format';

export type FileFormat = 'json' | 'csv' | 'xml' | 'xlsx';
export type LanguageFileNameRule = 'hyphen' | 'underscore' | 'language';

export type TranslateConfig = {
  apiUrl: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  prompt: string;
  file: {
    inputPath?: string;
    outputPath?: string;
    sourceLanguage: string;
    outputFileFormat?: OutputFileFormat;
    languageFileNameRule?: LanguageFileNameRule;
    languageFileNameMap?: Record<string, string>;
  };
};

export type ReadFileResult = {
  text: string;
  fileName: string;
  fullPath?: string;
  arrayBuffer?: ArrayBuffer;
};

export type ParsedTranslationDocument = {
  format: FileFormat;
  source: Record<string, unknown>;
};

export type TranslateRequestPayload = {
  sourceLanguage: string;
  targetLanguage?: string;
  content: Record<string, unknown>;
};

export type TranslateResult = {
  language: string;
  content: Record<string, unknown>;
};
