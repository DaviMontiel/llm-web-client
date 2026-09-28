import { IDBFactory } from 'fake-indexeddb';
import { IdbBackend } from './idb-backend';
import { MemoryBackend } from './memory-backend';
import { StorageBackend } from './storage-backend';
import { StorageService } from './storage.service';

interface Row {
  id: string;
  chatId: string;
  text: string;
}

function contract(name: string, create: () => Promise<StorageBackend>): void {
  describe(`${name} (contrato StorageBackend)`, () => {
    let backend: StorageBackend;
    beforeEach(async () => {
      backend = await create();
    });
    afterEach(() => backend.close());

    it('put/get/getAll/delete con keyPath', async () => {
      await backend.put<Row>('messages', { id: 'm1', chatId: 'c1', text: 'a' });
      await backend.putMany<Row>('messages', [
        { id: 'm2', chatId: 'c1', text: 'b' },
        { id: 'm3', chatId: 'c2', text: 'c' },
      ]);
      expect((await backend.get<Row>('messages', 'm1'))?.text).toBe('a');
      expect((await backend.getAll<Row>('messages')).length).toBe(3);
      await backend.delete('messages', 'm1');
      expect(await backend.get('messages', 'm1')).toBeUndefined();
    });

    it('consulta y borra por índice', async () => {
      await backend.putMany<Row>('messages', [
        { id: 'm1', chatId: 'c1', text: 'a' },
        { id: 'm2', chatId: 'c1', text: 'b' },
        { id: 'm3', chatId: 'c2', text: 'c' },
      ]);
      expect((await backend.getAllByIndex<Row>('messages', 'chatId', 'c1')).map((r) => r.id).sort()).toEqual([
        'm1',
        'm2',
      ]);
      await backend.deleteByIndex('messages', 'chatId', 'c1');
      expect((await backend.getAll<Row>('messages')).map((r) => r.id)).toEqual(['m3']);
    });

    it('almacena claves externas en kv y limpia stores', async () => {
      await backend.put('kv', { theme: 'dark' }, 'settings');
      expect(await backend.get('kv', 'settings')).toEqual({ theme: 'dark' });
      await backend.clear('kv');
      expect(await backend.get('kv', 'settings')).toBeUndefined();
    });

    it('devuelve copias (sin aliasing de objetos)', async () => {
      const row: Row = { id: 'x', chatId: 'c', text: 'orig' };
      await backend.put('messages', row);
      row.text = 'mutado';
      expect((await backend.get<Row>('messages', 'x'))?.text).toBe('orig');
    });
  });
}

let dbCounter = 0;
contract('IdbBackend', () => IdbBackend.open(new IDBFactory(), `test-db-${dbCounter++}`));
contract('MemoryBackend', async () => new MemoryBackend());

describe('StorageService', () => {
  it('usa IndexedDB cuando está disponible', async () => {
    const service = new StorageService();
    await service.init(new IDBFactory());
    expect(service.persistent()).toBe(true);
    await service.put('kv', 1, 'a');
    expect(await service.get('kv', 'a')).toBe(1);
  });

  it('degrada a memoria si IndexedDB falla al abrir', async () => {
    const broken = {
      open: () => {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory;
    const service = new StorageService();
    await service.init(broken);
    expect(service.persistent()).toBe(false);
    await service.put('kv', 'x', 'k');
    expect(await service.get('kv', 'k')).toBe('x');
  });
});
