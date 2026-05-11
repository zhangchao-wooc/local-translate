import { buildTargetFileName } from './format';
import { joinPath } from './path';
import type { ReadFileResult, TranslateConfig } from './types';

export type PickedInput = ReadFileResult & { handle?: FileSystemFileHandle };
export type PickedOutput = { handle?: FileSystemDirectoryHandle; pathHint?: string };

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

export const writeTranslatedFile = async (
  content: string,
  sourceFileName: string,
  config: TranslateConfig,
  output: PickedOutput
): Promise<{ fileName: string; pathHint?: string; mode: 'direct' | 'download' }> => {
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
