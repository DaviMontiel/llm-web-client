import { Observable } from 'rxjs';
import { AppError, ChatRequest, ChatStreamEvent, ConnectionInfo, LLMModel } from '../../models';
import { abortableObservable, joinUrl, providerFetch } from '../http';
import { LLMAdapter, normalizeConversation } from '../llm-adapter';
import { readSseEvents, safeJsonParse } from '../sse';

const API_VERSION = '2023-06-01';

type AnthropicContent =
  { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

interface AnthropicStreamPayload {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicModelInfo {
  id: string;
  display_name?: string;
  max_input_tokens?: number | null;
  max_tokens?: number | null;
  capabilities?: { image_input?: { supported?: boolean } };
}

/**
 * Anthropic Messages API. Admite llamadas directas desde navegador con la
 * cabecera `anthropic-dangerous-direct-browser-access`.
 */
export class AnthropicAdapter implements LLMAdapter {
  readonly kind = 'anthropic' as const;

  private headers(connection: ConnectionInfo): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': connection.config.apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  buildBody(request: ChatRequest): Record<string, unknown> {
    const messages = normalizeConversation(request.messages).map((m) => {
      const content: AnthropicContent[] = [];
      if (m.role === 'user' && request.model.capabilities.vision) {
        for (const img of m.images ?? []) {
          if (!img.dataBase64) continue;
          content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 } });
        }
      }
      if (m.content.trim()) content.push({ type: 'text', text: m.content });
      return { role: m.role, content };
    });
    const maxTokens = request.model.maxOutputTokens
      ? Math.min(request.maxOutputTokens, request.model.maxOutputTokens)
      : request.maxOutputTokens;
    const body: Record<string, unknown> = {
      model: request.model.id,
      max_tokens: maxTokens,
      messages,
      stream: request.stream,
    };
    if (request.system?.trim()) body['system'] = request.system;
    return body;
  }

  send(request: ChatRequest, connection: ConnectionInfo): Observable<ChatStreamEvent> {
    return abortableObservable<ChatStreamEvent>(async (signal, emit) => {
      const response = await providerFetch(joinUrl(connection.baseUrl, '/v1/messages'), {
        method: 'POST',
        headers: this.headers(connection),
        body: JSON.stringify(this.buildBody(request)),
        signal,
      });

      if (!request.stream) {
        const json = (await response.json()) as AnthropicResponse;
        const text = (json.content ?? [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('');
        emit({ type: 'token', text });
        if (json.usage)
          emit({
            type: 'usage',
            usage: { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens },
          });
        emit({ type: 'complete', stopReason: json.stop_reason });
        return;
      }

      let inputTokens: number | undefined;
      let stopReason: string | undefined;
      for await (const ev of readSseEvents(response)) {
        const payload = safeJsonParse<AnthropicStreamPayload>(ev.data);
        if (!payload) continue;
        switch (payload.type) {
          case 'message_start':
            inputTokens = payload.message?.usage?.input_tokens;
            break;
          case 'content_block_delta':
            if (payload.delta?.type === 'text_delta' && payload.delta.text)
              emit({ type: 'token', text: payload.delta.text });
            break;
          case 'message_delta':
            stopReason = payload.delta?.stop_reason ?? stopReason;
            emit({
              type: 'usage',
              usage: {
                inputTokens: payload.usage?.input_tokens ?? inputTokens,
                outputTokens: payload.usage?.output_tokens,
              },
            });
            break;
          case 'error':
            throw new AppError(
              payload.error?.type === 'overloaded_error' ? 'server' : 'unknown',
              'Provider stream error',
              {
                detail: payload.error?.message,
                retryable: true,
              },
            );
          default:
            break;
        }
      }
      emit({ type: 'complete', stopReason });
    });
  }

  async listModels(connection: ConnectionInfo, signal?: AbortSignal): Promise<LLMModel[]> {
    const models: LLMModel[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = joinUrl(
        connection.baseUrl,
        `/v1/models?limit=100${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}`,
      );
      const response = await providerFetch(url, { headers: this.headers(connection), signal });
      const json = (await response.json()) as { data?: AnthropicModelInfo[]; has_more?: boolean; last_id?: string };
      for (const m of json.data ?? []) {
        models.push({
          id: m.id,
          name: m.display_name ?? m.id,
          providerId: connection.provider.id,
          capabilities: {
            text: true,
            vision: m.capabilities?.image_input?.supported ?? true,
            files: true,
            streaming: true,
          },
          contextWindow: m.max_input_tokens ?? undefined,
          maxOutputTokens: m.max_tokens ?? undefined,
          origin: 'synced',
        });
      }
      if (!json.has_more || !json.last_id) break;
      afterId = json.last_id;
    }
    return models;
  }
}
