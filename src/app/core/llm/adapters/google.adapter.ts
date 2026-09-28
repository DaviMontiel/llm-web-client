import { Observable } from 'rxjs';
import { AppError, ChatRequest, ChatStreamEvent, ConnectionInfo, LLMModel } from '../../models';
import { abortableObservable, joinUrl, providerFetch } from '../http';
import { LLMAdapter, normalizeConversation } from '../llm-adapter';
import { readSseEvents, safeJsonParse } from '../sse';

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

interface GeminiModelInfo {
  name: string;
  displayName?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

/** Google Gemini API (`generateContent` / `streamGenerateContent`). */
export class GoogleAdapter implements LLMAdapter {
  readonly kind = 'google' as const;

  private headers(connection: ConnectionInfo): Record<string, string> {
    return { 'content-type': 'application/json', 'x-goog-api-key': connection.config.apiKey };
  }

  buildBody(request: ChatRequest): Record<string, unknown> {
    const contents = normalizeConversation(request.messages).map((m) => {
      const parts: GeminiPart[] = [];
      if (m.role === 'user' && request.model.capabilities.vision) {
        for (const img of m.images ?? []) {
          if (img.dataBase64) parts.push({ inline_data: { mime_type: img.mimeType, data: img.dataBase64 } });
        }
      }
      if (m.content.trim()) parts.push({ text: m.content });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
    const body: Record<string, unknown> = { contents };
    if (request.system?.trim()) body['systemInstruction'] = { parts: [{ text: request.system }] };
    return body;
  }

  private emitChunk(chunk: GeminiChunk, emit: (e: ChatStreamEvent) => void): string | undefined {
    if (chunk.error)
      throw new AppError('unknown', 'Provider stream error', { detail: chunk.error.message, retryable: true });
    if (chunk.promptFeedback?.blockReason) {
      throw new AppError('bad_request', 'Blocked by provider', { detail: chunk.promptFeedback.blockReason });
    }
    const candidate = chunk.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    if (text) emit({ type: 'token', text });
    if (chunk.usageMetadata) {
      emit({
        type: 'usage',
        usage: {
          inputTokens: chunk.usageMetadata.promptTokenCount,
          outputTokens: chunk.usageMetadata.candidatesTokenCount,
        },
      });
    }
    return candidate?.finishReason;
  }

  send(request: ChatRequest, connection: ConnectionInfo): Observable<ChatStreamEvent> {
    return abortableObservable<ChatStreamEvent>(async (signal, emit) => {
      const model = encodeURIComponent(request.model.id.replace(/^models\//, ''));
      const path = request.stream
        ? `/models/${model}:streamGenerateContent?alt=sse`
        : `/models/${model}:generateContent`;
      const response = await providerFetch(joinUrl(connection.baseUrl, path), {
        method: 'POST',
        headers: this.headers(connection),
        body: JSON.stringify(this.buildBody(request)),
        signal,
      });

      if (!request.stream) {
        const stop = this.emitChunk((await response.json()) as GeminiChunk, emit);
        emit({ type: 'complete', stopReason: stop });
        return;
      }
      let stopReason: string | undefined;
      for await (const ev of readSseEvents(response)) {
        const chunk = safeJsonParse<GeminiChunk>(ev.data);
        if (chunk) stopReason = this.emitChunk(chunk, emit) ?? stopReason;
      }
      emit({ type: 'complete', stopReason });
    });
  }

  async listModels(connection: ConnectionInfo, signal?: AbortSignal): Promise<LLMModel[]> {
    const models: LLMModel[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = joinUrl(
        connection.baseUrl,
        `/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
      );
      const response = await providerFetch(url, { headers: this.headers(connection), signal });
      const json = (await response.json()) as { models?: GeminiModelInfo[]; nextPageToken?: string };
      for (const m of json.models ?? []) {
        if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
        const id = m.name.replace(/^models\//, '');
        if (/embedding|aqa|imagen|veo|tts/i.test(id)) continue;
        models.push({
          id,
          name: m.displayName ?? id,
          providerId: connection.provider.id,
          capabilities: { text: true, vision: /gemini/i.test(id), files: true, streaming: true },
          contextWindow: m.inputTokenLimit,
          maxOutputTokens: m.outputTokenLimit,
          origin: 'synced',
        });
      }
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    return models;
  }
}
