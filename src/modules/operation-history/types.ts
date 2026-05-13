import type { FileChangeSet } from '../translate/file-system';
import type { TranslateConfig } from '../translate/types';

export type OperationRecord = {
  id: string;
  operatedAt: string;
  operationConfig: TranslateConfig;
  sourceFileName: string;
  outputDirectoryName: string;
  fileChange: FileChangeSet;
};
