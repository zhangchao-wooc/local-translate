import type { OperationRecord } from './types';

const STORAGE_KEY = 'operation-history';

export const readOperationHistory = (): OperationRecord[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OperationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const appendOperationRecord = (record: OperationRecord): OperationRecord[] => {
  const current = readOperationHistory();
  const next = [record, ...current];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};
