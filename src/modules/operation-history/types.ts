import type { FileChangeSet } from '../translate/file-system';
import type { TranslateConfig } from '../translate/types';

export type OperationRecord = {
  id: string;
  operatedAt: string;
  operationConfig: TranslateConfig;
  sourceFileName: string;
  outputDirectoryName: string;
  affectedFileNames?: string[];
  sourceEntries?: Record<string, unknown>;
  translatedEntries?: Record<string, Record<string, unknown>>;
  fileChanges?: FileChangeSet[];
  fileChange: FileChangeSet;
};
