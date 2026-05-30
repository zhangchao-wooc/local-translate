const DB_NAME = 'local-translate-handles';
const STORE_NAME = 'handles';
const DB_VERSION = 1;
const OUTPUT_DIRECTORY_KEY = 'output-directory';

type DbValue = FileSystemDirectoryHandle;

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('打开 IndexedDB 失败'));
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> => {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    return await run(store);
  } finally {
    db.close();
  }
};

export const saveOutputDirectoryHandle = async (
  handle: FileSystemDirectoryHandle,
): Promise<void> => {
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(handle, OUTPUT_DIRECTORY_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('保存目录失败'));
    });
  });
};

export const loadOutputDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  return withStore('readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(OUTPUT_DIRECTORY_KEY);
      request.onsuccess = () => {
        resolve((request.result as DbValue | undefined) || null);
      };
      request.onerror = () => reject(request.error || new Error('读取目录失败'));
    });
  });
};

export const clearOutputDirectoryHandle = async (): Promise<void> => {
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(OUTPUT_DIRECTORY_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('清理目录失败'));
    });
  });
};
