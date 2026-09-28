import { Injectable, signal } from '@angular/core';
import { IdbBackend } from './idb-backend';
import { MemoryBackend } from './memory-backend';
import { StorageBackend, StoreName } from './storage-backend';

export interface StorageEstimateInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

/**
 * Fachada sobre el almacenamiento local. Intenta IndexedDB y degrada a
 * memoria si no está disponible, sin romper la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private backend: StorageBackend = new MemoryBackend();
  private initPromise: Promise<void> | null = null;

  /** false si se está usando el backend en memoria (los datos no persistirán). */
  readonly persistent = signal(false);

  init(factory?: IDBFactory): Promise<void> {
    this.initPromise ??= this.open(factory);
    return this.initPromise;
  }

  /** Solo para tests: inyecta un backend concreto. */
  useBackend(backend: StorageBackend): void {
    this.backend = backend;
    this.persistent.set(backend.persistent);
    this.initPromise = Promise.resolve();
  }

  private async open(factory?: IDBFactory): Promise<void> {
    const idb = factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    if (!idb) {
      this.persistent.set(false);
      return;
    }
    try {
      this.backend = await IdbBackend.open(idb);
      this.persistent.set(true);
    } catch {
      this.backend = new MemoryBackend();
      this.persistent.set(false);
    }
  }

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.backend.get<T>(store, key);
  }
  getAll<T>(store: StoreName): Promise<T[]> {
    return this.backend.getAll<T>(store);
  }
  getAllByIndex<T>(store: StoreName, index: string, value: string): Promise<T[]> {
    return this.backend.getAllByIndex<T>(store, index, value);
  }
  put<T>(store: StoreName, value: T, key?: string): Promise<void> {
    return this.backend.put(store, value, key);
  }
  putMany<T>(store: StoreName, values: readonly T[]): Promise<void> {
    return this.backend.putMany(store, values);
  }
  delete(store: StoreName, key: string): Promise<void> {
    return this.backend.delete(store, key);
  }
  deleteMany(store: StoreName, keys: readonly string[]): Promise<void> {
    return this.backend.deleteMany(store, keys);
  }
  deleteByIndex(store: StoreName, index: string, value: string): Promise<void> {
    return this.backend.deleteByIndex(store, index, value);
  }
  clear(store: StoreName): Promise<void> {
    return this.backend.clear(store);
  }

  async clearAll(): Promise<void> {
    const stores: StoreName[] = ['chats', 'messages', 'projects', 'snapshotFiles', 'handles', 'kv'];
    for (const s of stores) await this.backend.clear(s);
  }

  async estimate(): Promise<StorageEstimateInfo> {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.estimate) return { usage: null, quota: null, persisted: null };
    try {
      const [est, persisted] = await Promise.all([
        storage.estimate(),
        storage.persisted ? storage.persisted() : Promise.resolve(null),
      ]);
      return { usage: est.usage ?? null, quota: est.quota ?? null, persisted };
    } catch {
      return { usage: null, quota: null, persisted: null };
    }
  }

  /** Solicita almacenamiento persistente (evita que el navegador lo purgue). */
  async requestPersistence(): Promise<boolean> {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.persist) return false;
    try {
      return await storage.persist();
    } catch {
      return false;
    }
  }
}
