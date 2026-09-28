import { DestroyRef, Injectable, inject } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { Chat, Message } from '../models';
import { ProjectService } from '../projects/project.service';
import { StorageService } from '../storage/storage.service';
import { snippetAround } from '../utils/format';
import { ChatStore } from './chat-store.service';

export type SearchResultKind = 'chat' | 'message' | 'project';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  chatId?: string;
  messageId?: string;
  title: string;
  snippet: string;
  timestamp: number;
  score: number;
}

interface IndexedMessage {
  id: string;
  role: Message['role'];
  text: string;
  lower: string;
  createdAt: number;
}

/**
 * Búsqueda global en títulos, contenido de mensajes y proyectos.
 * El índice se construye de forma perezosa desde IndexedDB y se
 * actualiza por chat cuando cambian sus mensajes.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly store = inject(ChatStore);
  private readonly projects = inject(ProjectService);
  private readonly storage = inject(StorageService);
  private readonly i18n = inject(I18nService);
  private index: Map<string, IndexedMessage[]> | null = null;
  private building: Promise<void> | null = null;
  private readonly dirty = new Set<string>();

  constructor() {
    const sub = this.store.messagesChanged.subscribe((chatId) => this.dirty.add(chatId));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  private toIndexed(messages: readonly Message[]): IndexedMessage[] {
    return messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        lower: m.content.toLowerCase(),
        createdAt: m.createdAt,
      }));
  }

  private async ensureIndex(): Promise<Map<string, IndexedMessage[]>> {
    if (!this.index) {
      this.building ??= (async () => {
        const all = await this.storage.getAll<Message>('messages').catch(() => [] as Message[]);
        const map = new Map<string, Message[]>();
        for (const m of all) {
          const list = map.get(m.chatId);
          if (list) list.push(m);
          else map.set(m.chatId, [m]);
        }
        const index = new Map<string, IndexedMessage[]>();
        for (const [chatId, msgs] of map) index.set(chatId, this.toIndexed(msgs));
        this.index = index;
      })();
      await this.building;
    }
    const index = this.index as Map<string, IndexedMessage[]>;
    for (const chatId of [...this.dirty]) {
      this.dirty.delete(chatId);
      if (!this.store.chat(chatId)) {
        index.delete(chatId);
        continue;
      }
      await this.store.ensureMessages(chatId).catch(() => undefined);
      index.set(chatId, this.toIndexed(this.store.messagesOf(chatId)()));
    }
    // Chats temporales: solo en memoria.
    for (const chat of this.store.temporaryChats())
      index.set(chat.id, this.toIndexed(this.store.messagesOf(chat.id)()));
    return index;
  }

  /** IDs de chats cuyo título, proyecto o contenido coincide (para el filtro del sidebar). */
  async matchingChatIds(query: string): Promise<Set<string>> {
    const q = query.trim().toLowerCase();
    const result = new Set<string>();
    if (!q) return result;
    const index = await this.ensureIndex();
    for (const chat of this.store.chats()) {
      if (this.chatMetaMatches(chat, q)) result.add(chat.id);
      else if (index.get(chat.id)?.some((m) => m.lower.includes(q))) result.add(chat.id);
    }
    return result;
  }

  private chatMetaMatches(chat: Chat, q: string): boolean {
    const title = (chat.title || this.i18n.t('chat.untitled')).toLowerCase();
    if (title.includes(q)) return true;
    const project = this.projects.get(chat.projectId);
    return !!project && project.name.toLowerCase().includes(q);
  }

  async search(query: string, limit = 50): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const index = await this.ensureIndex();
    const results: SearchResult[] = [];

    for (const project of this.projects.projects()) {
      const hay = `${project.name} ${project.rootName ?? ''} ${project.description}`.toLowerCase();
      if (hay.includes(q)) {
        results.push({
          kind: 'project',
          id: project.id,
          title: project.name,
          snippet: project.rootName ?? project.description,
          timestamp: project.updatedAt,
          score: project.name.toLowerCase().startsWith(q) ? 3 : 2,
        });
      }
    }

    for (const chat of this.store.chats()) {
      const title = chat.title || this.i18n.t('chat.untitled');
      if (this.chatMetaMatches(chat, q)) {
        results.push({
          kind: 'chat',
          id: chat.id,
          chatId: chat.id,
          title,
          snippet: this.projects.get(chat.projectId)?.name ?? '',
          timestamp: chat.updatedAt,
          score: title.toLowerCase().startsWith(q) ? 3 : 2,
        });
      }
      let perChat = 0;
      for (const m of index.get(chat.id) ?? []) {
        if (!m.lower.includes(q)) continue;
        results.push({
          kind: 'message',
          id: m.id,
          chatId: chat.id,
          messageId: m.id,
          title,
          snippet: snippetAround(m.text, query.trim()),
          timestamp: m.createdAt,
          score: 1,
        });
        if (++perChat >= 3) break;
      }
    }
    return results.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp).slice(0, limit);
  }

  reset(): void {
    this.index = null;
    this.building = null;
    this.dirty.clear();
  }
}
