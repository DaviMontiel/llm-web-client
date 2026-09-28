import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { LLMAdapter } from '../app/core/llm/llm-adapter';
import { LlmService } from '../app/core/llm/llm.service';
import { ProviderConfigService } from '../app/core/llm/provider-config.service';
import { ChatRequest, ChatStreamEvent, LLMModel, ProviderKind } from '../app/core/models';
import { MemoryBackend } from '../app/core/storage/memory-backend';
import { StorageService } from '../app/core/storage/storage.service';

/** Configura TestBed con almacenamiento en memoria. */
export function setupStorage(): StorageService {
  const storage = TestBed.inject(StorageService);
  storage.useBackend(new MemoryBackend());
  return storage;
}

/** Adapter controlable para tests: registra las peticiones y permite emitir eventos. */
export class FakeAdapter implements LLMAdapter {
  readonly requests: ChatRequest[] = [];
  /** Si se define, cada `send` devuelve este Subject (streaming manual). */
  stream: Subject<ChatStreamEvent> | null = null;
  reply = 'respuesta';
  cancelled = 0;

  constructor(readonly kind: ProviderKind = 'anthropic') {}

  send(request: ChatRequest): Observable<ChatStreamEvent> {
    this.requests.push(request);
    if (this.stream) {
      const s = this.stream;
      return new Observable<ChatStreamEvent>((sub) => {
        const inner = s.subscribe(sub);
        return () => {
          this.cancelled++;
          inner.unsubscribe();
        };
      });
    }
    const events: ChatStreamEvent[] = [
      { type: 'token', text: this.reply },
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 3 } },
      { type: 'complete', stopReason: 'end_turn' },
    ];
    return of(...events);
  }

  async listModels(): Promise<LLMModel[]> {
    return [];
  }
}

/** Registra un FakeAdapter para Anthropic y configura una API key de prueba. */
export function setupFakeProvider(): FakeAdapter {
  const adapter = new FakeAdapter('anthropic');
  TestBed.inject(LlmService).registerAdapter(adapter);
  TestBed.inject(ProviderConfigService).updateConfig('anthropic', { apiKey: 'sk-test', enabled: true });
  return adapter;
}

/** Espera a que se vacíen microtareas y frames simulados. */
export async function flush(ms = 60): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
