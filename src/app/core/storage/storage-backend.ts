export type StoreName = 'chats' | 'messages' | 'projects' | 'snapshotFiles' | 'handles' | 'kv';

export interface StoreSchema {
  /** keyPath en línea; undefined = claves externas (se pasan en `put`). */
  keyPath?: string;
  indexes?: readonly { name: string; keyPath: string }[];
}

export const DB_NAME = 'llm-workspace';
export const DB_VERSION = 1;

export const STORE_SCHEMAS: Readonly<Record<StoreName, StoreSchema>> = {
  chats: { keyPath: 'id' },
  messages: { keyPath: 'id', indexes: [{ name: 'chatId', keyPath: 'chatId' }] },
  projects: { keyPath: 'id' },
  snapshotFiles: { keyPath: 'key', indexes: [{ name: 'projectId', keyPath: 'projectId' }] },
  handles: {},
  kv: {},
};

/** Abstracción mínima sobre un almacén clave-valor con índices. */
export interface StorageBackend {
  readonly persistent: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  getAllByIndex<T>(store: StoreName, index: string, value: string): Promise<T[]>;
  put<T>(store: StoreName, value: T, key?: string): Promise<void>;
  putMany<T>(store: StoreName, values: readonly T[]): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  deleteMany(store: StoreName, keys: readonly string[]): Promise<void>;
  deleteByIndex(store: StoreName, index: string, value: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  close(): void;
}
