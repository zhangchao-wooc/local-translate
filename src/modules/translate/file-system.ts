import { buildTargetFileName, parseDocument, serializeDocument } from './format';
import { joinPath } from './path';
import type { ReadFileResult, TranslateConfig } from './types';

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

export const supportsFileSystemAccess = (): boolean => {
  return Boolean(window.showOpenFilePicker && window.showDirectoryPicker);
};

export const pickInputFile = async (): Promise<PickedInput> => {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Translation Files', accept: { 'application/json': ['.json'], 'text/csv': ['.csv'], 'application/xml': ['.xml'] } }],
    });
    const file = await handle.getFile();
    return { text: await file.text(), fileName: file.name, handle };
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.csv,.xml';
  input.click();

  return new Promise((resolve, reject) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
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
  content: string,
  sourceFileName: string,
  config: TranslateConfig,
  output: PickedOutput
): Promise<WriteTranslatedFileResult> => {
  const mappedFileName = buildTargetFileName(
    sourceFileName,
    config.file.targetLanguage,
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

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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

export const mergeAndWriteTranslatedFile = async (
  sourceFileName: string,
  translatedContent: Record<string, unknown>,
  config: TranslateConfig,
  output: PickedOutput,
  onMissingFile?: (fileName: string) => Promise<boolean>,
): Promise<WriteTranslatedFileResult> => {
  const mappedFileName = buildTargetFileName(
    sourceFileName,
    config.file.targetLanguage,
    config.file.languageFileNameRule,
    config.file.languageFileNameMap,
  );

  if (!output.handle) {
    const outputText = serializeDocument(parseDocument('{}', mappedFileName).format, translatedContent);
    return writeTranslatedFile(outputText, sourceFileName, config, output);
  }

  let targetHandle: FileSystemFileHandle | null = null;
  let beforeContent: Record<string, unknown> = {};
  let mergedContent: Record<string, unknown> = { ...translatedContent };
  let format = parseDocument('{}', mappedFileName).format;
  let created = false;

  try {
    targetHandle = await output.handle.getFileHandle(mappedFileName);
    const currentFile = await targetHandle.getFile();
    const currentText = await currentFile.text();
    const parsedCurrent = parseDocument(currentText, mappedFileName);
    beforeContent = parsedCurrent.source;
    format = parsedCurrent.format;
    // Translation result has higher priority and overwrites same keys from current file.
    mergedContent = { ...beforeContent, ...translatedContent };
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
