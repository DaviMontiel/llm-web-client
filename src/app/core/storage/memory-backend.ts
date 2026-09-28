import { STORE_SCHEMAS, StorageBackend, StoreName } from './storage-backend';

function clone<T>(value: T): T {
  // FileSystemHandle no es clonable con structuredClone en todos los entornos; se guarda por referencia.
  if (typeof value === 'object' && value !== null && 'kind' in value && 'getFile' in value) return value;
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

/**
 * Backend en memoria. Se usa cuando IndexedDB no está disponible
 * (modo privado restrictivo, navegadores antiguos) y en tests.
 */
export class MemoryBackend implements StorageBackend {
  readonly persistent = false;
  private readonly stores = new Map<StoreName, Map<string, unknown>>();

  private map(store: StoreName): Map<string, unknown> {
    let m = this.stores.get(store);
    if (!m) {
      m = new Map();
      this.stores.set(store, m);
    }
    return m;
  }

  private keyOf(store: StoreName, value: unknown, key?: string): string {
    const keyPath = STORE_SCHEMAS[store].keyPath;
    if (keyPath) {
      const k = (value as Record<string, unknown>)[keyPath];
      if (typeof k !== 'string') throw new Error(`Missing key "${keyPath}" in ${store}`);
      return k;
    }
    if (key === undefined) throw new Error(`Store ${store} requires an explicit key`);
    return key;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const v = this.map(store).get(key);
    return v === undefined ? undefined : clone(v as T);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.map(store).values()].map((v) => clone(v as T));
  }

  async getAllByIndex<T>(store: StoreName, index: string, value: string): Promise<T[]> {
    const idx = STORE_SCHEMAS[store].indexes?.find((i) => i.name === index);
    if (!idx) throw new Error(`Unknown index ${index}`);
    return [...this.map(store).values()]
      .filter((v) => (v as Record<string, unknown>)[idx.keyPath] === value)
      .map((v) => clone(v as T));
  }

  async put<T>(store: StoreName, value: T, key?: string): Promise<void> {
    this.map(store).set(this.keyOf(store, value, key), clone(value));
  }

  async putMany<T>(store: StoreName, values: readonly T[]): Promise<void> {
    for (const v of values) await this.put(store, v);
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.map(store).delete(key);
  }

  async deleteMany(store: StoreName, keys: readonly string[]): Promise<void> {
    for (const k of keys) this.map(store).delete(k);
  }

  async deleteByIndex(store: StoreName, index: string, value: string): Promise<void> {
    const idx = STORE_SCHEMAS[store].indexes?.find((i) => i.name === index);
    if (!idx) throw new Error(`Unknown index ${index}`);
    const m = this.map(store);
    for (const [k, v] of m) if ((v as Record<string, unknown>)[idx.keyPath] === value) m.delete(k);
  }

  async clear(store: StoreName): Promise<void> {
    this.map(store).clear();
  }

  close(): void {
    this.stores.clear();
  }
}
