export const OUTPUT_FILE_FORMAT_OPTIONS = [
  { label: 'json', value: 'json' },
  { label: 'xml', value: 'xml' },
  { label: 'xlsx', value: 'xlsx' },
] as const;

export type OutputFileFormat = (typeof OUTPUT_FILE_FORMAT_OPTIONS)[number]['value'];

export const DEFAULT_OUTPUT_FILE_FORMAT: OutputFileFormat = 'json';
