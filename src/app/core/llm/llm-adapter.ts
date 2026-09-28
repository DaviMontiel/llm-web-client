import { Observable } from 'rxjs';
import { ChatMessage, ChatRequest, ChatStreamEvent, ConnectionInfo, LLMModel, ProviderKind } from '../models';

/**
 * Contrato que implementa cada proveedor. El chat nunca llama a `fetch`
 * directamente: siempre pasa por `LlmService`, que elige el adapter.
 *
 * `send` emite `token` (incremental o de golpe si no hay streaming),
 * `usage` si el proveedor lo informa, y termina con `complete`.
 * Cancelar la suscripción aborta la petición HTTP (AbortController).
 */
export interface LLMAdapter {
  readonly kind: ProviderKind;
  send(request: ChatRequest, connection: ConnectionInfo): Observable<ChatStreamEvent>;
  /** Lista los modelos disponibles para la cuenta, si la API lo permite. */
  listModels(connection: ConnectionInfo, signal?: AbortSignal): Promise<LLMModel[]>;
}

/**
 * Normaliza la conversación para APIs que exigen alternancia estricta:
 * elimina mensajes vacíos, fusiona roles consecutivos y garantiza que
 * el primero sea del usuario.
 */
export function normalizeConversation(messages: readonly ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const m of messages) {
    const hasImages = (m.images?.length ?? 0) > 0;
    if (!m.content.trim() && !hasImages) continue;
    const last = result[result.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
      if (hasImages) last.images = [...(last.images ?? []), ...(m.images ?? [])];
    } else {
      result.push({ role: m.role, content: m.content, images: m.images ? [...m.images] : undefined });
    }
  }
  while (result.length > 0 && result[0].role !== 'user') result.shift();
  return result;
}
