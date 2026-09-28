import { TestBed } from '@angular/core/testing';
import { flush, setupFakeProvider, setupStorage } from '../../../testing/test-helpers';
import { ChatStore } from '../chat/chat-store.service';
import { ProviderConfigService } from '../llm/provider-config.service';
import { EXPORT_FORMAT, ExportImportService, parseExportFile } from './export-import.service';

describe('parseExportFile', () => {
  it('rechaza JSON inválido o de otro formato', () => {
    expect(() => parseExportFile('{')).toThrow('invalid-json');
    expect(() => parseExportFile('{"format":"otro"}')).toThrow('invalid-format');
  });

  it('descarta entradas inválidas y mensajes huérfanos', () => {
    const { file, invalid } = parseExportFile(
      JSON.stringify({
        format: EXPORT_FORMAT,
        version: 1,
        chats: [{ id: 'c1', title: 'A', createdAt: 1, updatedAt: 1 }, { id: 3 }],
        messages: [
          {
            id: 'm1',
            chatId: 'c1',
            parentId: null,
            role: 'user',
            content: 'x',
            attachments: [],
            createdAt: 1,
            status: 'streaming',
          },
          {
            id: 'm2',
            chatId: 'otro',
            parentId: null,
            role: 'user',
            content: 'x',
            attachments: [],
            createdAt: 1,
            status: 'complete',
          },
          { id: 'm3', chatId: 'c1', role: 'hacker', content: 'x' },
        ],
        projects: [{ id: 'p1', name: 'P', createdAt: 1, source: 'fs-access' }],
      }),
    );
    expect(invalid).toBe(2);
    expect(file.chats.length).toBe(1);
    expect(file.messages.map((m) => m.id)).toEqual(['m1']);
    expect(file.messages[0].status).toBe('interrupted');
    expect(file.projects[0].source).toBe('none');
  });
});

describe('ExportImportService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    setupStorage();
    setupFakeProvider();
  });

  it('exporta sin API keys e importa sin sobrescribir en silencio', async () => {
    const store = TestBed.inject(ChatStore);
    const service = TestBed.inject(ExportImportService);
    const chat = await store.createChat();
    await store.send(chat.id, { text: 'hola', attachments: [] });
    await flush();

    const exported = await service.buildExport();
    const json = JSON.stringify(exported);
    expect(json).not.toContain('sk-test');
    expect(exported.chats.length).toBe(1);
    expect(exported.messages.length).toBe(2);

    const plan = service.plan(json);
    expect(plan.existingChats).toBe(1);
    expect(plan.newChats).toBe(0);

    await service.apply(plan, { strategy: 'skip', importSettings: false });
    expect(store.history().length).toBe(1);

    await service.apply(plan, { strategy: 'duplicate', importSettings: false });
    expect(store.history().length).toBe(2);
    const copy = store.history().find((c) => c.id !== chat.id)!;
    await store.ensureMessages(copy.id);
    expect(store.activePath(copy.id).map((m) => m.content)).toEqual(['hola', 'respuesta']);

    await service.apply(plan, { strategy: 'replace', importSettings: true });
    expect(store.history().length).toBe(2);
    expect(TestBed.inject(ProviderConfigService).config('anthropic').apiKey).toBe('sk-test');
  });

  it('exporta un chat como Markdown', async () => {
    const store = TestBed.inject(ChatStore);
    const chat = await store.createChat();
    await store.send(chat.id, { text: 'pregunta', attachments: [] });
    await flush();
    const md = await TestBed.inject(ExportImportService).chatToMarkdown(chat.id);
    expect(md).toContain('## Tú');
    expect(md).toContain('pregunta');
    expect(md).toContain('respuesta');
  });
});
