import { Observable } from 'rxjs';
import { AppError, ChatRequest, ChatStreamEvent, ConnectionInfo, LLMModel } from '../../models';
import { abortableObservable, joinUrl, providerFetch } from '../http';
import { LLMAdapter, normalizeConversation } from '../llm-adapter';
import { readSseEvents, safeJsonParse } from '../sse';

type ResponsesContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'output_text'; text: string };

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface ResponsesObject {
  status?: string;
  usage?: ResponsesUsage;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
}

interface ResponsesStreamPayload {
  type?: string;
  delta?: string;
  message?: string;
  response?: ResponsesObject;
}

const NON_CHAT_MARKERS = [
  'embedding',
  'tts',
  'whisper',
  'dall-e',
  'image',
  'audio',
  'realtime',
  'transcribe',
  'moderation',
  'search',
  'computer-use',
  'sora',
];

/** Filtra `/v1/models` a modelos de chat/razonamiento. */
export function isOpenAiChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (NON_CHAT_MARKERS.some((m) => lower.includes(m))) return false;
  return /^(gpt-|o\d|chatgpt-)/.test(lower);
}

/**
 * OpenAI Responses API (`/v1/responses`). Se usa `store: false` para que
 * las conversaciones no queden almacenadas en el proveedor.
 */
export class OpenAIAdapter implements LLMAdapter {
  readonly kind = 'openai' as const;

  private headers(connection: ConnectionInfo): Record<string, string> {
    return { 'content-type': 'application/json', authorization: `Bearer ${connection.config.apiKey}` };
  }

  buildBody(request: ChatRequest): Record<string, unknown> {
    const input = normalizeConversation(request.messages).map((m) => {
      if (m.role === 'assistant') {
        return { role: 'assistant', content: [{ type: 'output_text', text: m.content } satisfies ResponsesContent] };
      }
      const content: ResponsesContent[] = [];
      if (m.content.trim()) content.push({ type: 'input_text', text: m.content });
      if (request.model.capabilities.vision) {
        for (const img of m.images ?? []) {
          if (img.dataBase64)
            content.push({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.dataBase64}` });
        }
      }
      return { role: 'user', content };
    });
    const body: Record<string, unknown> = { model: request.model.id, input, stream: request.stream, store: false };
    if (request.system?.trim()) body['instructions'] = request.system;
    return body;
  }

  send(request: ChatRequest, connection: ConnectionInfo): Observable<ChatStreamEvent> {
    return abortableObservable<ChatStreamEvent>(async (signal, emit) => {
      const response = await providerFetch(joinUrl(connection.baseUrl, '/responses'), {
        method: 'POST',
        headers: this.headers(connection),
        body: JSON.stringify(this.buildBody(request)),
        signal,
      });

      if (!request.stream) {
        const json = (await response.json()) as ResponsesObject;
        const text = (json.output ?? [])
          .filter((o) => o.type === 'message')
          .flatMap((o) => o.content ?? [])
          .filter((c) => c.type === 'output_text')
          .map((c) => c.text ?? '')
          .join('');
        emit({ type: 'token', text });
        if (json.usage)
          emit({
            type: 'usage',
            usage: { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens },
          });
        emit({ type: 'complete', stopReason: json.incomplete_details?.reason ?? json.status });
        return;
      }

      let stopReason: string | undefined;
      for await (const ev of readSseEvents(response)) {
        if (ev.data === '[DONE]') break;
        const payload = safeJsonParse<ResponsesStreamPayload>(ev.data);
        if (!payload) continue;
        const type = payload.type ?? ev.event;
        if (type === 'response.output_text.delta' && payload.delta) {
          emit({ type: 'token', text: payload.delta });
        } else if (type === 'response.completed' || type === 'response.incomplete') {
          const usage = payload.response?.usage;
          if (usage)
            emit({ type: 'usage', usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } });
          stopReason = payload.response?.incomplete_details?.reason ?? payload.response?.status;
        } else if (type === 'response.failed') {
          throw new AppError('server', 'Provider stream error', {
            detail: payload.response?.error?.message,
            retryable: true,
          });
        } else if (type === 'error') {
          throw new AppError('unknown', 'Provider stream error', { detail: payload.message, retryable: true });
        }
      }
      emit({ type: 'complete', stopReason });
    });
  }

  async listModels(connection: ConnectionInfo, signal?: AbortSignal): Promise<LLMModel[]> {
    const response = await providerFetch(joinUrl(connection.baseUrl, '/models'), {
      headers: this.headers(connection),
      signal,
    });
    const json = (await response.json()) as { data?: { id: string }[] };
    return (json.data ?? [])
      .filter((m) => isOpenAiChatModel(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        providerId: connection.provider.id,
        capabilities: { text: true, vision: true, files: true, streaming: true },
        origin: 'synced' as const,
      }));
  }
}
