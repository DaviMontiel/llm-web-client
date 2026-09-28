import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { FakeAdapter, flush, setupFakeProvider, setupStorage } from '../../../testing/test-helpers';
import { ChatStreamEvent, Message } from '../models';
import { ProjectService } from '../projects/project.service';
import { StorageService } from '../storage/storage.service';
import { ChatStore } from './chat-store.service';

describe('ChatStore', () => {
  let store: ChatStore;
  let storage: StorageService;
  let adapter: FakeAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    storage = setupStorage();
    store = TestBed.inject(ChatStore);
    adapter = setupFakeProvider();
  });

  it('crea un chat persistente y lo elimina con sus mensajes', async () => {
    const chat = await store.createChat();
    expect(await storage.get('chats', chat.id)).toBeTruthy();
    await store.send(chat.id, { text: 'hola', attachments: [] });
    await flush();
    expect((await storage.getAllByIndex('messages', 'chatId', chat.id)).length).toBe(2);
    await store.deleteChat(chat.id);
    expect(store.chat(chat.id)).toBeUndefined();
    expect(await storage.get('chats', chat.id)).toBeUndefined();
    expect((await storage.getAllByIndex('messages', 'chatId', chat.id)).length).toBe(0);
  });

  it('los chats temporales no se escriben en IndexedDB', async () => {
    const chat = await store.createChat({ temporary: true });
    await store.send(chat.id, { text: 'secreto', attachments: [] });
    await flush();
    expect(await storage.get('chats', chat.id)).toBeUndefined();
    expect((await storage.getAll<Message>('messages')).length).toBe(0);
    expect(store.temporaryChats().map((c) => c.id)).toContain(chat.id);
    expect(store.history().map((c) => c.id)).not.toContain(chat.id);
  });

  it('envía, genera la respuesta y titula el chat localmente', async () => {
    const chat = await store.createChat();
    const ok = await store.send(chat.id, { text: 'Hola, explícame los signals de Angular', attachments: [] });
    expect(ok).toBe(true);
    await flush();
    const path = store.activePath(chat.id);
    expect(path.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(path[1].content).toBe('respuesta');
    expect(path[1].status).toBe('complete');
    expect(path[1].usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(store.chat(chat.id)?.title).toBe('Explícame los signals de Angular');
    expect(store.chat(chat.id)?.lastUsage?.inputTokens).toBe(12);
    expect(adapter.requests[0].messages).toEqual([
      { role: 'user', content: 'Hola, explícame los signals de Angular', images: undefined },
    ]);
  });

  it('evita dobles envíos mientras genera', async () => {
    adapter.stream = new Subject<ChatStreamEvent>();
    const chat = await store.createChat();
    const [a, b] = await Promise.all([
      store.send(chat.id, { text: 'uno', attachments: [] }),
      store.send(chat.id, { text: 'dos', attachments: [] }),
    ]);
    expect([a, b].filter(Boolean).length).toBe(1);
    expect(
      store
        .messagesOf(chat.id)()
        .filter((m) => m.role === 'user').length,
    ).toBe(1);
    store.stop(chat.id);
  });

  it('detener conserva la respuesta parcial y cancela la petición', async () => {
    const stream = new Subject<ChatStreamEvent>();
    adapter.stream = stream;
    const chat = await store.createChat();
    await store.send(chat.id, { text: 'larga', attachments: [] });
    await flush(10);
    stream.next({ type: 'token', text: 'parcial' });
    await flush(40);
    store.stop(chat.id);
    const last = store.activePath(chat.id).at(-1);
    expect(last?.status).toBe('stopped');
    expect(last?.content).toBe('parcial');
    expect(adapter.cancelled).toBe(1);
    expect(store.isGenerating(chat.id)).toBe(false);
  });

  it('marca error sin configurar proveedor y reintenta sobre el mismo mensaje', async () => {
    const chat = await store.createChat();
    adapter.stream = new Subject<ChatStreamEvent>();
    const stream = adapter.stream;
    await store.send(chat.id, { text: 'hola', attachments: [] });
    await flush(10);
    stream.error(new TypeError('boom'));
    await flush();
    const failed = store.activePath(chat.id).at(-1) as Message;
    expect(failed.status).toBe('error');
    adapter.stream = null;
    expect(store.retry(chat.id, failed.id)).toBe(true);
    await flush();
    const retried = store.activePath(chat.id).at(-1) as Message;
    expect(retried.id).toBe(failed.id);
    expect(retried.status).toBe('complete');
    expect(store.messagesOf(chat.id)().length).toBe(2);
  });

  it('regenerar y editar crean ramas sin destruir el historial', async () => {
    const chat = await store.createChat();
    await store.send(chat.id, { text: 'pregunta', attachments: [] });
    await flush();
    const [user, first] = store.activePath(chat.id);
    adapter.reply = 'segunda';
    store.regenerate(chat.id, first.id);
    await flush();
    expect(store.activePath(chat.id).at(-1)?.content).toBe('segunda');
    expect(store.messagesOf(chat.id)().length).toBe(3);

    store.switchBranch(chat.id, store.activePath(chat.id).at(-1)!.id, -1);
    expect(store.activePath(chat.id).at(-1)?.id).toBe(first.id);

    adapter.reply = 'tras editar';
    store.editAndResend(chat.id, user.id, 'pregunta editada');
    await flush();
    const path = store.activePath(chat.id);
    expect(path[0].content).toBe('pregunta editada');
    expect(path[1].content).toBe('tras editar');
    expect(store.messagesOf(chat.id)().length).toBe(5);
  });

  it('continuar desde un mensaje y eliminar un subárbol ajustan la hoja activa', async () => {
    const chat = await store.createChat();
    await store.send(chat.id, { text: 'a', attachments: [] });
    await flush();
    await store.send(chat.id, { text: 'b', attachments: [] });
    await flush();
    const path = store.activePath(chat.id);
    store.continueFrom(chat.id, path[1].id);
    expect(store.hasContinuation(chat.id)).toBe(true);
    store.returnToLatest(chat.id);
    expect(store.activePath(chat.id).length).toBe(4);
    store.deleteMessage(chat.id, path[2].id);
    expect(store.activePath(chat.id).map((m) => m.id)).toEqual([path[0].id, path[1].id]);
  });

  it('duplica chats con nuevos ids y el árbol intacto', async () => {
    const chat = await store.createChat();
    await store.send(chat.id, { text: 'original', attachments: [] });
    await flush();
    const copy = await store.duplicateChat(chat.id);
    expect(copy).toBeTruthy();
    const copyPath = store.activePath(copy!.id);
    expect(copyPath.map((m) => m.content)).toEqual(['original', 'respuesta']);
    expect(copyPath[0].id).not.toBe(store.activePath(chat.id)[0].id);
    expect(copyPath[1].parentId).toBe(copyPath[0].id);
  });

  it('convierte entre temporal y permanente', async () => {
    const chat = await store.createChat();
    await store.send(chat.id, { text: 'x', attachments: [] });
    await flush();
    await store.setTemporary(chat.id, true);
    expect(await storage.get('chats', chat.id)).toBeUndefined();
    await store.setTemporary(chat.id, false);
    expect(await storage.get('chats', chat.id)).toBeTruthy();
    expect((await storage.getAllByIndex('messages', 'chatId', chat.id)).length).toBe(2);
  });

  it('recupera generaciones interrumpidas al recargar', async () => {
    const chat = await store.createChat();
    await storage.put('chats', { ...store.chat(chat.id)!, activeLeafId: 'm2' });
    await storage.putMany('messages', [
      {
        id: 'm1',
        chatId: chat.id,
        parentId: null,
        role: 'user',
        content: 'q',
        attachments: [],
        createdAt: 1,
        updatedAt: 1,
        status: 'complete',
      },
      {
        id: 'm2',
        chatId: chat.id,
        parentId: 'm1',
        role: 'assistant',
        content: 'medio',
        attachments: [],
        createdAt: 2,
        updatedAt: 2,
        status: 'streaming',
      },
    ]);
    const fresh = TestBed.runInInjectionContext(() => new ChatStore());
    await fresh.load();
    await fresh.ensureMessages(chat.id);
    expect(
      fresh
        .messagesOf(chat.id)()
        .find((m) => m.id === 'm2')?.status,
    ).toBe('interrupted');
    expect((await storage.get<Message>('messages', 'm2'))?.status).toBe('interrupted');
  });

  it('incluye instrucciones y archivos del proyecto en el system prompt', async () => {
    const projects = TestBed.inject(ProjectService);
    const project = await projects.create({ name: 'Demo', instructions: 'Usa Dart idiomático.' });
    const chat = await store.createChat({ projectId: project.id });
    await store.send(chat.id, { text: 'hola', attachments: [] });
    await flush();
    expect(adapter.requests[0].system).toContain('<instructions>\nUsa Dart idiomático.\n</instructions>');
    expect(store.activePath(chat.id).at(-1)?.context?.instructions).toBe(true);
  });
});
