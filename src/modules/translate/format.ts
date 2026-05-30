import type { FileFormat, LanguageFileNameRule, ParsedTranslationDocument } from './types';
import * as XLSX from 'xlsx';

const inferFormatFromFileName = (fileName: string): FileFormat => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.xlsx')) return 'xlsx';
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
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML 解析失败，请检查文件格式');
  }

  const map: Record<string, string> = {};
  const attrKeyCandidates = ['key', 'name', 'id'];

  // Priority 1: explicit key-like attributes.
  const keyedNodes = Array.from(doc.querySelectorAll('*')).filter((node) =>
    attrKeyCandidates.some((attr) => node.hasAttribute(attr)),
  );
  keyedNodes.forEach((node) => {
    const keyAttr = attrKeyCandidates.find((attr) => node.hasAttribute(attr));
    const key = keyAttr ? node.getAttribute(keyAttr) : '';
    if (!key) return;
    const value = (node.textContent || '').trim();
    if (value) map[key] = value;
  });

  // Priority 2: generic leaf-node fallback, key by XML path.
  if (Object.keys(map).length === 0 && doc.documentElement) {
    const walk = (element: Element, path: string) => {
      const childElements = Array.from(element.children);
      if (childElements.length === 0) {
        const value = (element.textContent || '').trim();
        if (value) map[path] = value;
        return;
      }
      childElements.forEach((child) => {
        const nextPath = path ? `${path}.${child.tagName}` : child.tagName;
        walk(child, nextPath);
      });
    };
    walk(doc.documentElement, doc.documentElement.tagName);
  }

  return map;
};

const parseXLSX = (arrayBuffer: ArrayBuffer): Record<string, unknown> => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return {};
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
  const map: Record<string, unknown> = {};

  const hasHeader = String(rows[0]?.[0] ?? '').trim().toLowerCase() === 'key';
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const key = String(row[0] ?? '').trim();
    if (!key) continue;
    map[key] = row[1] ?? '';
  }
  return map;
};

const toCSV = (obj: Record<string, unknown>): string => {
  return Object.entries(obj)
    .map(([k, v]) => `"${String(k).replace(/"/g, '""')}","${String(v ?? '').replace(/"/g, '""')}"`)
    .join('\n');
};

const escapeXML = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const toXML = (obj: Record<string, unknown>): string => {
  const body = Object.entries(obj)
    .map(([k, v]) => `    <string name="${escapeXML(String(k))}">${escapeXML(String(v ?? ''))}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<resources>\n${body}\n</resources>\n`;
};

const toXLSX = (obj: Record<string, unknown>): ArrayBuffer => {
  const rows: Array<[string, string]> = [['key', 'value']];
  Object.entries(obj).forEach(([key, value]) => {
    rows.push([key, String(value ?? '')]);
  });
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'translations');
  const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return content;
};

export const parseDocument = (text: string, fileName: string): ParsedTranslationDocument => {
  const format = inferFormatFromFileName(fileName);
  if (format === 'csv') return { format, source: parseCSV(text) };
  if (format === 'xml') return { format, source: parseXML(text) };
  if (format === 'xlsx') {
    throw new Error('xlsx 文件请使用 parseBinaryDocument 解析');
  }
  return { format, source: JSON.parse(text) as Record<string, unknown> };
};

export const parseBinaryDocument = (arrayBuffer: ArrayBuffer, fileName: string): ParsedTranslationDocument => {
  const format = inferFormatFromFileName(fileName);
  if (format === 'xlsx') return { format, source: parseXLSX(arrayBuffer) };
  const text = new TextDecoder().decode(arrayBuffer);
  return parseDocument(text, fileName);
};

export const serializeDocument = (format: FileFormat, content: Record<string, unknown>): string | ArrayBuffer => {
  if (format === 'csv') return toCSV(content);
  if (format === 'xml') return toXML(content);
  if (format === 'xlsx') return toXLSX(content);
  return `${JSON.stringify(content, null, 2)}\n`;
};

export const buildTargetFileName = (
  sourceFileName: string,
  languageTag: string,
  languageFileNameRule: LanguageFileNameRule = 'hyphen',
  languageFileNameMap?: Record<string, string>,
): string => {
  const idx = sourceFileName.lastIndexOf('.');
  const byRule =
    languageFileNameRule === 'underscore'
      ? languageTag.replace(/-/g, '_')
      : languageFileNameRule === 'language'
        ? languageTag.split('-')[0] || languageTag
        : languageTag;
  const customMapped = languageFileNameMap?.[languageTag];
  const isRuleGeneratedValue =
    customMapped === languageTag ||
    customMapped === languageTag.replace(/-/g, '_') ||
    customMapped === (languageTag.split('-')[0] || languageTag);
  const mapped = customMapped && !isRuleGeneratedValue ? customMapped : byRule;

  if (idx < 0) return `${mapped}.json`;
  return `${mapped}${sourceFileName.slice(idx)}`;
};
