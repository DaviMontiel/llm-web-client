import { Observable } from 'rxjs';
import { AppError, ChatRequest, ChatStreamEvent, ConnectionInfo, LLMModel } from '../../models';
import { abortableObservable, joinUrl, providerFetch } from '../http';
import { LLMAdapter, normalizeConversation } from '../llm-adapter';
import { readSseEvents, safeJsonParse } from '../sse';

type ChatCompletionPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

interface ChatCompletionChunk {
  choices?: {
    delta?: { content?: string | null };
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string };
}

/**
 * Adapter genérico para APIs compatibles con OpenAI Chat Completions
 * (`/chat/completions`): Ollama, LM Studio, OpenRouter, Groq, Mistral, vLLM…
 * La URL base se configura por proveedor.
 */
export class OpenAICompatibleAdapter implements LLMAdapter {
  readonly kind = 'openai-compatible' as const;

  private headers(connection: ConnectionInfo): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (connection.config.apiKey) h['authorization'] = `Bearer ${connection.config.apiKey}`;
    return h;
  }

  buildBody(request: ChatRequest): Record<string, unknown> {
    const messages: { role: string; content: string | ChatCompletionPart[] }[] = [];
    if (request.system?.trim()) messages.push({ role: 'system', content: request.system });
    for (const m of normalizeConversation(request.messages)) {
      const images =
        m.role === 'user' && request.model.capabilities.vision ? (m.images ?? []).filter((i) => i.dataBase64) : [];
      if (images.length === 0) {
        messages.push({ role: m.role, content: m.content });
      } else {
        const parts: ChatCompletionPart[] = [];
        if (m.content.trim()) parts.push({ type: 'text', text: m.content });
        for (const img of images)
          parts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` } });
        messages.push({ role: m.role, content: parts });
      }
    }
    return { model: request.model.id, messages, stream: request.stream };
  }

  send(request: ChatRequest, connection: ConnectionInfo): Observable<ChatStreamEvent> {
    return abortableObservable<ChatStreamEvent>(async (signal, emit) => {
      const response = await providerFetch(joinUrl(connection.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: this.headers(connection),
        body: JSON.stringify(this.buildBody(request)),
        signal,
      });

      if (!request.stream) {
        const json = (await response.json()) as ChatCompletionChunk;
        const choice = json.choices?.[0];
        emit({ type: 'token', text: choice?.message?.content ?? '' });
        if (json.usage)
          emit({
            type: 'usage',
            usage: { inputTokens: json.usage.prompt_tokens, outputTokens: json.usage.completion_tokens },
          });
        emit({ type: 'complete', stopReason: choice?.finish_reason ?? undefined });
        return;
      }

      let stopReason: string | undefined;
      for await (const ev of readSseEvents(response)) {
        if (ev.data.trim() === '[DONE]') break;
        const chunk = safeJsonParse<ChatCompletionChunk>(ev.data);
        if (!chunk) continue;
        if (chunk.error)
          throw new AppError('unknown', 'Provider stream error', { detail: chunk.error.message, retryable: true });
        const choice = chunk.choices?.[0];
        const text = choice?.delta?.content;
        if (text) emit({ type: 'token', text });
        if (choice?.finish_reason) stopReason = choice.finish_reason;
        if (chunk.usage)
          emit({
            type: 'usage',
            usage: { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens },
          });
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
      .filter((m) => typeof m.id === 'string' && !/embed/i.test(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        providerId: connection.provider.id,
        // La API /models no informa de visión: se asume solo texto; el usuario puede activarla.
        capabilities: { text: true, vision: false, files: true, streaming: true },
        origin: 'synced' as const,
      }));
  }
}
