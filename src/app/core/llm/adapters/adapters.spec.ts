import { firstValueFrom, toArray } from 'rxjs';
import { AppError, ChatRequest, ChatStreamEvent, ConnectionInfo, LLMModel, LLMProvider } from '../../models';
import { BUILTIN_PROVIDERS } from '../provider-catalog';
import { normalizeConversation } from '../llm-adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GoogleAdapter } from './google.adapter';
import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { OpenAIAdapter, isOpenAiChatModel } from './openai.adapter';

function sse(events: unknown[]): Response {
  const text = events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function provider(id: string): LLMProvider {
  const p = BUILTIN_PROVIDERS.find((x) => x.id === id);
  if (p) return p;
  return {
    id,
    name: id,
    kind: 'openai-compatible',
    description: '',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    custom: true,
    models: [],
  };
}

function connection(id: string, baseUrl: string): ConnectionInfo {
  return {
    provider: provider(id),
    baseUrl,
    config: { providerId: id, enabled: true, apiKey: 'test-key', persistApiKey: true, models: [], hiddenModelIds: [] },
  };
}

const model = (id: string, vision = true, maxOutputTokens?: number): LLMModel => ({
  id,
  name: id,
  providerId: 'x',
  capabilities: { text: true, vision, files: true, streaming: true },
  maxOutputTokens,
  origin: 'catalog',
});

function request(m: LLMModel, stream = true): ChatRequest {
  return {
    model: m,
    system: 'Sé breve',
    stream,
    maxOutputTokens: 8192,
    messages: [
      { role: 'user', content: 'Hola', images: [{ name: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }] },
      { role: 'assistant', content: 'Hola, ¿qué tal?' },
      { role: 'user', content: 'Resume' },
    ],
  };
}

async function collect(obs: ReturnType<AnthropicAdapter['send']>): Promise<ChatStreamEvent[]> {
  return firstValueFrom(obs.pipe(toArray()));
}

describe('normalizeConversation', () => {
  it('fusiona roles consecutivos y elimina vacíos', () => {
    const out = normalizeConversation([
      { role: 'assistant', content: 'huérfano' },
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: 'c' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'a\n\nb', images: undefined },
      { role: 'assistant', content: 'c', images: undefined },
    ]);
  });
});

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter();
  afterEach(() => vi.restoreAllMocks());

  it('construye el cuerpo con imágenes, system y max_tokens limitado', () => {
    const body = adapter.buildBody(request(model('claude-x', true, 4096)));
    expect(body['max_tokens']).toBe(4096);
    expect(body['system']).toBe('Sé breve');
    const messages = body['messages'] as { role: string; content: { type: string }[] }[];
    expect(messages[0].content.map((c) => c.type)).toEqual(['image', 'text']);
  });

  it('omite imágenes si el modelo no tiene visión', () => {
    const body = adapter.buildBody(request(model('claude-x', false)));
    const messages = body['messages'] as { content: { type: string }[] }[];
    expect(messages[0].content.map((c) => c.type)).toEqual(['text']);
  });

  it('emite tokens y uso en streaming con las cabeceras de navegador', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sse([
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Ho' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'la' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
      ]),
    );
    const events = await collect(
      adapter.send(request(model('claude-x')), connection('anthropic', 'https://api.anthropic.com')),
    );
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(
      events
        .filter((e) => e.type === 'token')
        .map((e) => (e as { text: string }).text)
        .join(''),
    ).toBe('Hola');
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } });
    expect(events[events.length - 1]).toEqual({ type: 'complete', stopReason: 'end_turn' });
  });

  it('mapea 401 a AppError auth', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    );
    await expect(
      collect(adapter.send(request(model('m')), connection('anthropic', 'https://api.anthropic.com'))),
    ).rejects.toMatchObject({
      code: 'auth',
      options: { detail: 'bad key' },
    });
  });

  it('mapea fallos de red (CORS) a AppError network', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await collect(
      adapter.send(request(model('m')), connection('anthropic', 'https://api.anthropic.com')),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('network');
  });

  it('aborta la petición al cancelar la suscripción', async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      signal = (init as RequestInit).signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const sub = adapter.send(request(model('m')), connection('anthropic', 'https://api.anthropic.com')).subscribe();
    await Promise.resolve();
    sub.unsubscribe();
    expect(signal?.aborted).toBe(true);
  });

  it('pagina el listado de modelos', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'a', display_name: 'A', max_input_tokens: 1000 }],
            has_more: true,
            last_id: 'a',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ id: 'b', capabilities: { image_input: { supported: false } } }], has_more: false }),
        ),
      );
    const models = await adapter.listModels(connection('anthropic', 'https://api.anthropic.com'));
    expect(models.map((m) => m.id)).toEqual(['a', 'b']);
    expect(models[0].contextWindow).toBe(1000);
    expect(models[1].capabilities.vision).toBe(false);
  });
});

describe('OpenAIAdapter (Responses API)', () => {
  const adapter = new OpenAIAdapter();
  afterEach(() => vi.restoreAllMocks());

  it('usa input_text/input_image/output_text, instructions y store:false', () => {
    const body = adapter.buildBody(request(model('gpt-x')));
    expect(body['instructions']).toBe('Sé breve');
    expect(body['store']).toBe(false);
    const input = body['input'] as { role: string; content: { type: string }[] }[];
    expect(input[0].content.map((c) => c.type)).toEqual(['input_text', 'input_image']);
    expect(input[1].content[0].type).toBe('output_text');
  });

  it('parsea eventos de streaming', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sse([
        { type: 'response.output_text.delta', delta: 'A' },
        { type: 'response.output_text.delta', delta: 'B' },
        { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 2 } } },
      ]),
    );
    const events = await collect(
      adapter.send(request(model('gpt-x')), connection('openai', 'https://api.openai.com/v1')),
    );
    expect(events.filter((e) => e.type === 'token').length).toBe(2);
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it('filtra modelos que no son de chat', () => {
    expect(isOpenAiChatModel('gpt-6-sol')).toBe(true);
    expect(isOpenAiChatModel('o4-mini')).toBe(true);
    expect(isOpenAiChatModel('text-embedding-3-large')).toBe(false);
    expect(isOpenAiChatModel('gpt-image-1')).toBe(false);
    expect(isOpenAiChatModel('whisper-1')).toBe(false);
  });
});

describe('OpenAICompatibleAdapter', () => {
  const adapter = new OpenAICompatibleAdapter();
  afterEach(() => vi.restoreAllMocks());

  it('usa system + content parts solo con visión', () => {
    const withVision = adapter.buildBody(request(model('llava')));
    const msgs = withVision['messages'] as { role: string; content: unknown }[];
    expect(msgs[0]).toEqual({ role: 'system', content: 'Sé breve' });
    expect(Array.isArray(msgs[1].content)).toBe(true);
    const noVision = adapter.buildBody(request(model('coder', false)));
    expect(typeof (noVision['messages'] as { content: unknown }[])[1].content).toBe('string');
  });

  it('no envía Authorization si no hay API key y termina en [DONE]', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        sse([
          { choices: [{ delta: { content: 'x' } }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
          '[DONE]',
        ]),
      );
    const conn = connection('custom-1', 'http://localhost:11434/v1');
    conn.config.apiKey = '';
    const events = await collect(adapter.send(request(model('coder', false)), conn));
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBeUndefined();
    expect(spy.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
    expect(events[events.length - 1]).toEqual({ type: 'complete', stopReason: 'stop' });
  });
});

describe('GoogleAdapter', () => {
  const adapter = new GoogleAdapter();
  afterEach(() => vi.restoreAllMocks());

  it('mapea roles a user/model e inline_data', () => {
    const body = adapter.buildBody(request(model('gemini-x')));
    const contents = body['contents'] as { role: string; parts: Record<string, unknown>[] }[];
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(Object.keys(contents[0].parts[0])).toEqual(['inline_data']);
    expect(body['systemInstruction']).toEqual({ parts: [{ text: 'Sé breve' }] });
  });

  it('usa alt=sse, ignora partes de pensamiento y reporta uso', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sse([
        { candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'Hola' }] } }] },
        {
          candidates: [{ content: { parts: [{ text: '!' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
        },
      ]),
    );
    const events = await collect(
      adapter.send(
        request(model('gemini-x')),
        connection('google', 'https://generativelanguage.googleapis.com/v1beta'),
      ),
    );
    expect(spy.mock.calls[0][0]).toContain(':streamGenerateContent?alt=sse');
    expect(
      events
        .filter((e) => e.type === 'token')
        .map((e) => (e as { text: string }).text)
        .join(''),
    ).toBe('Hola!');
    expect(events[events.length - 1]).toEqual({ type: 'complete', stopReason: 'STOP' });
  });
});
