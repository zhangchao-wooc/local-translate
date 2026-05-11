import type { FileFormat, LanguageFileNameRule, ParsedTranslationDocument } from './types';

const inferFormatFromFileName = (fileName: string): FileFormat => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xml')) return 'xml';
  return 'json';
};

const parseCSV = (text: string): Record<string, unknown> => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const map: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(',');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().replace(/^"|"$/g, '');
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (key) map[key] = value;
  }
  return map;
};

const parseXML = (text: string): Record<string, unknown> => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const items = Array.from(doc.querySelectorAll('[key]'));
  const map: Record<string, string> = {};
  items.forEach((node) => {
    const key = node.getAttribute('key');
    if (!key) return;
    map[key] = node.textContent || '';
  });
  return map;
};

const toCSV = (obj: Record<string, unknown>): string => {
  return Object.entries(obj)
    .map(([k, v]) => `"${String(k).replace(/"/g, '""')}","${String(v ?? '').replace(/"/g, '""')}"`)
    .join('\n');
};

const toXML = (obj: Record<string, unknown>): string => {
  const body = Object.entries(obj)
    .map(([k, v]) => `  <item key="${k}">${String(v ?? '')}</item>`)
    .join('\n');
  return `<translations>\n${body}\n</translations>`;
};

export const parseDocument = (text: string, fileName: string): ParsedTranslationDocument => {
  const format = inferFormatFromFileName(fileName);
  if (format === 'csv') return { format, source: parseCSV(text) };
  if (format === 'xml') return { format, source: parseXML(text) };
  return { format, source: JSON.parse(text) as Record<string, unknown> };
};

export const serializeDocument = (format: FileFormat, content: Record<string, unknown>): string => {
  if (format === 'csv') return toCSV(content);
  if (format === 'xml') return toXML(content);
  return `${JSON.stringify(content, null, 2)}\n`;
};

export const buildTargetFileName = (
  sourceFileName: string,
  targetLanguage: string,
  languageFileNameRule: LanguageFileNameRule = 'hyphen',
  languageFileNameMap?: Record<string, string>,
): string => {
  const idx = sourceFileName.lastIndexOf('.');
  const byRule =
    languageFileNameRule === 'underscore'
      ? targetLanguage.replace(/-/g, '_')
      : languageFileNameRule === 'language'
        ? targetLanguage.split('-')[0] || targetLanguage
        : targetLanguage;
  const customMapped = languageFileNameMap?.[targetLanguage];
  const isRuleGeneratedValue =
    customMapped === targetLanguage ||
    customMapped === targetLanguage.replace(/-/g, '_') ||
    customMapped === (targetLanguage.split('-')[0] || targetLanguage);
  const mapped = customMapped && !isRuleGeneratedValue ? customMapped : byRule;

  if (idx < 0) return `${mapped}.json`;
  return `${mapped}${sourceFileName.slice(idx)}`;
};
