import { buildTargetFileName, parseBinaryDocument, parseDocument, serializeDocument } from './format';
import { joinPath } from './path';
import type { FileFormat, ReadFileResult, TranslateConfig } from './types';

export type PickedInput = ReadFileResult & { handle?: FileSystemFileHandle };
export type PickedOutput = { handle?: FileSystemDirectoryHandle; pathHint?: string };
export type KeyValueChange = { key: string; before?: unknown; after?: unknown };
export type FileChangeSet = {
  fileName: string;
  created: boolean;
  updated: KeyValueChange[];
  added: KeyValueChange[];
  deleted: KeyValueChange[];
};
export type WriteTranslatedFileResult = {
  fileName: string;
  pathHint?: string;
  mode: 'direct' | 'download';
  changes?: FileChangeSet;
};

export type DirectoryFileItem = {
  fileName: string;
  extension: string;
};

const inferFormatFromFileName = (fileName: string): FileFormat => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return 'json';
};

export const supportsFileSystemAccess = (): boolean => {
  return Boolean(window.showOpenFilePicker && window.showDirectoryPicker);
};

export const pickInputFile = async (): Promise<PickedInput> => {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'Translation Files',
        accept: {
          'application/json': ['.json'],
          'text/csv': ['.csv'],
          'application/xml': ['.xml'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        },
      }],
    });
    const file = await handle.getFile();
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.xlsx')) {
      return { text: '', arrayBuffer: await file.arrayBuffer(), fileName: file.name, handle };
    }
    return { text: await file.text(), fileName: file.name, handle };
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.csv,.xml,.xlsx';
  input.click();

  return new Promise((resolve, reject) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.xlsx')) {
        resolve({ text: '', arrayBuffer: await file.arrayBuffer(), fileName: file.name });
        return;
      }
      resolve({ text: await file.text(), fileName: file.name });
    };
  });
};

export const pickOutputDirectory = async (): Promise<PickedOutput> => {
  if (window.showDirectoryPicker) {
    const handle = await window.showDirectoryPicker();
    return { handle };
  }
  return {};
};

export const listDirectoryFiles = async (handle: FileSystemDirectoryHandle): Promise<DirectoryFileItem[]> => {
  const files: DirectoryFileItem[] = [];
  for await (const [, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;
    const idx = entry.name.lastIndexOf('.');
    const extension = idx >= 0 ? entry.name.slice(idx + 1).toLowerCase() : '';
    files.push({ fileName: entry.name, extension });
  }
  return files;
};

export const writeTranslatedFile = async (
  content: string | ArrayBuffer,
  sourceFileName: string,
  language: string,
  config: TranslateConfig,
  output: PickedOutput
): Promise<WriteTranslatedFileResult> => {
  const mappedFileName = buildTargetFileName(
    sourceFileName,
    language,
    config.file.languageFileNameRule,
    config.file.languageFileNameMap,
  );

  if (output.handle) {
    const fileHandle = await output.handle.getFileHandle(mappedFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return { fileName: mappedFileName, mode: 'direct' };
  }

  const fileLowerName = mappedFileName.toLowerCase();
  const isXlsx = fileLowerName.endsWith('.xlsx');
  const blob = new Blob(
    [content],
    {
      type: isXlsx
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/plain;charset=utf-8',
    },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = mappedFileName;
  anchor.click();
  URL.revokeObjectURL(url);

  const pathHint = config.file.outputPath ? joinPath(config.file.outputPath, mappedFileName) : undefined;
  return { fileName: mappedFileName, pathHint, mode: 'download' };
};

const stringifyValue = (value: unknown): string => JSON.stringify(value);

const buildChangeSet = (
  fileName: string,
  beforeContent: Record<string, unknown>,
  afterContent: Record<string, unknown>,
  created: boolean,
): FileChangeSet => {
  const updated: KeyValueChange[] = [];
  const added: KeyValueChange[] = [];
  const deleted: KeyValueChange[] = [];
  const keySet = new Set<string>([...Object.keys(beforeContent), ...Object.keys(afterContent)]);

  keySet.forEach((key) => {
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeContent, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterContent, key);
    const before = beforeContent[key];
    const after = afterContent[key];

    if (hasBefore && hasAfter) {
      if (stringifyValue(before) !== stringifyValue(after)) {
        updated.push({ key, before, after });
      }
      return;
    }

    if (!hasBefore && hasAfter) {
      added.push({ key, after });
      return;
    }

    deleted.push({ key, before });
  });

  return { fileName, created, updated, added, deleted };
};

export const mergeAndWriteLanguageFile = async (
  sourceFileName: string,
  language: string,
  content: Record<string, unknown>,
  config: TranslateConfig,
  output: PickedOutput,
  onMissingFile?: (fileName: string) => Promise<boolean>,
): Promise<WriteTranslatedFileResult> => {
  const mappedFileName = buildTargetFileName(
    sourceFileName,
    language,
    config.file.languageFileNameRule,
    config.file.languageFileNameMap,
  );

  if (!output.handle) {
    const outputText = serializeDocument(inferFormatFromFileName(mappedFileName), content);
    return writeTranslatedFile(outputText, sourceFileName, language, config, output);
  }

  let targetHandle: FileSystemFileHandle | null = null;
  let beforeContent: Record<string, unknown> = {};
  let mergedContent: Record<string, unknown> = { ...content };
  let format = inferFormatFromFileName(mappedFileName);
  let created = false;

  try {
    targetHandle = await output.handle.getFileHandle(mappedFileName);
    const currentFile = await targetHandle.getFile();
    const parsedCurrent = mappedFileName.toLowerCase().endsWith('.xlsx')
      ? parseBinaryDocument(await currentFile.arrayBuffer(), mappedFileName)
      : parseDocument(await currentFile.text(), mappedFileName);
    beforeContent = parsedCurrent.source;
    format = parsedCurrent.format;
    // New content has higher priority and overwrites same keys from current file.
    mergedContent = { ...beforeContent, ...content };
  } catch {
    const shouldCreate = onMissingFile ? await onMissingFile(mappedFileName) : false;
    if (!shouldCreate) {
      throw new Error(`目标文件 ${mappedFileName} 不存在，已取消写入`);
    }
    targetHandle = await output.handle.getFileHandle(mappedFileName, { create: true });
    created = true;
  }

  const changeSet = buildChangeSet(mappedFileName, beforeContent, mergedContent, created);
  const nextText = serializeDocument(format, mergedContent);
  const writable = await targetHandle.createWritable();
  await writable.write(nextText);
  await writable.close();

  return { fileName: mappedFileName, mode: 'direct', changes: changeSet };
};

export const mergeAndWriteTranslatedFile = async (
  sourceFileName: string,
  language: string,
  translatedContent: Record<string, unknown>,
  config: TranslateConfig,
  output: PickedOutput,
  onMissingFile?: (fileName: string) => Promise<boolean>,
): Promise<WriteTranslatedFileResult> => {
  return mergeAndWriteLanguageFile(
    sourceFileName,
    language,
    translatedContent,
    config,
    output,
    onMissingFile,
  );
};
