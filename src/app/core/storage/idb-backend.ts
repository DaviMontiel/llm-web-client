import { DB_NAME, DB_VERSION, STORE_SCHEMAS, StorageBackend, StoreName } from './storage-backend';

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Backend persistente sobre IndexedDB (API nativa, sin dependencias). */
export class IdbBackend implements StorageBackend {
  readonly persistent = true;

  private constructor(private readonly db: IDBDatabase) {
    // Otra pestaña con una versión nueva de la BD: cerrar para no bloquearla.
    db.onversionchange = () => db.close();
  }

  static open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IdbBackend> {
    return new Promise((resolve, reject) => {
      const request = factory.open(name, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [storeName, schema] of Object.entries(STORE_SCHEMAS)) {
          if (db.objectStoreNames.contains(storeName)) continue;
          const store = db.createObjectStore(storeName, schema.keyPath ? { keyPath: schema.keyPath } : undefined);
          for (const idx of schema.indexes ?? []) store.createIndex(idx.name, idx.keyPath, { unique: false });
        }
      };
      request.onsuccess = () => resolve(new IdbBackend(request.result));
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
    });
  }

  private store(name: StoreName, mode: IDBTransactionMode): { tx: IDBTransaction; store: IDBObjectStore } {
    const tx = this.db.transaction(name, mode);
    return { tx, store: tx.objectStore(name) };
  }

  async get<T>(storeName: StoreName, key: string): Promise<T | undefined> {
    const { store } = this.store(storeName, 'readonly');
    return (await promisify(store.get(key))) as T | undefined;
  }

  async getAll<T>(storeName: StoreName): Promise<T[]> {
    const { store } = this.store(storeName, 'readonly');
    return (await promisify(store.getAll())) as T[];
  }

  async getAllByIndex<T>(storeName: StoreName, index: string, value: string): Promise<T[]> {
    const { store } = this.store(storeName, 'readonly');
    return (await promisify(store.index(index).getAll(value))) as T[];
  }

  async put<T>(storeName: StoreName, value: T, key?: string): Promise<void> {
    const { tx, store } = this.store(storeName, 'readwrite');
    if (STORE_SCHEMAS[storeName].keyPath) store.put(value);
    else store.put(value, key);
    await txDone(tx);
  }

  async putMany<T>(storeName: StoreName, values: readonly T[]): Promise<void> {
    if (values.length === 0) return;
    const { tx, store } = this.store(storeName, 'readwrite');
    for (const v of values) store.put(v);
    await txDone(tx);
  }

  async delete(storeName: StoreName, key: string): Promise<void> {
    const { tx, store } = this.store(storeName, 'readwrite');
    store.delete(key);
    await txDone(tx);
  }

  async deleteMany(storeName: StoreName, keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    const { tx, store } = this.store(storeName, 'readwrite');
    for (const k of keys) store.delete(k);
    await txDone(tx);
  }

  async deleteByIndex(storeName: StoreName, index: string, value: string): Promise<void> {
    const { tx, store } = this.store(storeName, 'readwrite');
    const keys = await promisify(store.index(index).getAllKeys(value));
    for (const k of keys) store.delete(k);
    await txDone(tx);
  }

  async clear(storeName: StoreName): Promise<void> {
    const { tx, store } = this.store(storeName, 'readwrite');
    store.clear();
    await txDone(tx);
  }

  close(): void {
    this.db.close();
  }
}
