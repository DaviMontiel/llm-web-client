import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { I18nService } from '../i18n/i18n.service';
import { LlmService } from '../llm/llm.service';
import { ProviderConfigService } from '../llm/provider-config.service';
import {
  AppError,
  Attachment,
  Chat,
  ChatContextSelection,
  ChatStreamEvent,
  EMPTY_CONTEXT,
  Message,
  ModelRef,
  TokenUsage,
  toAppErrorInfo,
} from '../models';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import {
  buildChildrenIndex,
  collectSubtree,
  deepestLeaf,
  getPathToLeaf,
  getSiblings,
  latestLeaf,
} from '../utils/conversation-tree';
import { createId } from '../utils/id';
import { generateLocalTitle } from '../utils/title';
import { RequestBuilderService } from './request-builder.service';
import { TemporaryChatStorage } from './temporary-chat-storage';

export interface SendInput {
  text: string;
  attachments: Attachment[];
}

export interface NewChatOptions {
  temporary?: boolean;
  projectId?: string | null;
  model?: ModelRef | null;
}

interface ActiveGeneration {
  token: string;
  messageId: string;
  content: string;
  usage: TokenUsage;
  subscription: Subscription | null;
  cancelled: boolean;
  flushHandle: number | null;
  lastPersist: number;
}

const PERSIST_INTERVAL_MS = 1500;

function requestFrame(cb: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(cb, 32) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle);
}

/** Completa campos ausentes de un Chat almacenado o importado. */
export function normalizeChat(raw: Chat): Chat {
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    projectId: typeof raw.projectId === 'string' ? raw.projectId : null,
    model:
      raw.model && typeof raw.model.providerId === 'string' && typeof raw.model.modelId === 'string' ? raw.model : null,
    temporary: raw.temporary === true,
    favorite: raw.favorite === true,
    activeLeafId: typeof raw.activeLeafId === 'string' ? raw.activeLeafId : null,
    titleLocked: raw.titleLocked === true,
    context: {
      files: Array.isArray(raw.context?.files) ? raw.context.files.filter((f) => typeof f === 'string') : [],
      includeInstructions: raw.context?.includeInstructions !== false,
    },
    lastUsage: raw.lastUsage,
  };
}

/**
 * Store de conversaciones basado en signals. Gestiona el árbol de mensajes
 * (ramas por edición/regeneración), la generación en streaming con
 * cancelación, y la persistencia (IndexedDB o sessionStorage para temporales).
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly storage = inject(StorageService);
  private readonly llm = inject(LlmService);
  private readonly providers = inject(ProviderConfigService);
  private readonly builder = inject(RequestBuilderService);
  private readonly settings = inject(SettingsService);
  private readonly i18n = inject(I18nService);
  private readonly temp = new TemporaryChatStorage();

  private readonly messageSignals = new Map<string, WritableSignal<Message[]>>();
  private readonly loadingMessages = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, ActiveGeneration>();

  readonly chats = signal<Chat[]>([]);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly generatingChats = signal<ReadonlySet<string>>(new Set());
  /** Chat abierto en la vista principal. */
  readonly activeChatId = signal<string | null>(null);
  /** Notifica cambios de mensajes (p. ej. para el índice de búsqueda). */
  readonly messagesChanged = new Subject<string>();

  /** Historial visible: se ocultan los chats vacíos (salvo los renombrados). */
  readonly history = computed(() =>
    this.chats()
      .filter((c) => !c.temporary && (c.activeLeafId !== null || c.titleLocked))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );
  readonly temporaryChats = computed(() =>
    this.chats()
      .filter((c) => c.temporary && c.activeLeafId !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      const all = (await this.storage.getAll<Chat>('chats'))
        .map(normalizeChat)
        .map((c) => ({ ...c, temporary: false }));
      // Chats vacíos de sesiones anteriores ("Nuevo chat" sin mensajes): se eliminan.
      const empty = all.filter((c) => c.activeLeafId === null && !c.titleLocked && !c.favorite);
      const stored = all.filter((c) => !empty.includes(c));
      if (empty.length)
        await this.storage
          .deleteMany(
            'chats',
            empty.map((c) => c.id),
          )
          .catch(() => undefined);
      const tempSnapshot = this.temp.load();
      const tempChats = tempSnapshot.chats.map(normalizeChat).map((c) => ({ ...c, temporary: true }));
      for (const chat of tempChats) {
        const msgs = tempSnapshot.messages
          .filter((m) => m.chatId === chat.id)
          .map((m) => (m.status === 'streaming' ? { ...m, status: 'interrupted' as const } : m));
        this.messageSignals.set(chat.id, signal(msgs));
      }
      this.chats.set([...stored, ...tempChats]);
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  chat(id: string | null | undefined): Chat | undefined {
    return id ? this.chats().find((c) => c.id === id) : undefined;
  }

  /** Signal con todos los mensajes (árbol completo) de un chat. */
  messagesOf(chatId: string): Signal<Message[]> {
    return this.messageSignal(chatId).asReadonly();
  }

  isGenerating(chatId: string): boolean {
    return this.generatingChats().has(chatId);
  }

  /** Carga los mensajes desde IndexedDB (una sola vez) y recupera generaciones interrumpidas. */
  ensureMessages(chatId: string): Promise<void> {
    if (this.messageSignals.has(chatId)) return Promise.resolve();
    let pending = this.loadingMessages.get(chatId);
    if (!pending) {
      pending = this.loadMessagesFromStorage(chatId).finally(() => this.loadingMessages.delete(chatId));
      this.loadingMessages.set(chatId, pending);
    }
    return pending;
  }

  private async loadMessagesFromStorage(chatId: string): Promise<void> {
    const stored = await this.storage.getAllByIndex<Message>('messages', 'chatId', chatId);
    const interrupted: Message[] = [];
    const messages = stored.map((m) => {
      if (m.status === 'streaming' && !this.generations.has(chatId)) {
        const fixed: Message = { ...m, status: 'interrupted' };
        interrupted.push(fixed);
        return fixed;
      }
      return m;
    });
    if (!this.messageSignals.has(chatId)) this.messageSignals.set(chatId, signal(messages));
    if (interrupted.length) await this.storage.putMany('messages', interrupted).catch(() => undefined);
    const chat = this.chat(chatId);
    if (chat && messages.length > 0 && !messages.some((m) => m.id === chat.activeLeafId)) {
      this.updateChat(chatId, { activeLeafId: latestLeaf(messages) }, false);
    }
  }

  private messageSignal(chatId: string): WritableSignal<Message[]> {
    let s = this.messageSignals.get(chatId);
    if (!s) {
      s = signal<Message[]>([]);
      this.messageSignals.set(chatId, s);
    }
    return s;
  }

  // ---------------------------------------------------------------- chats

  async createChat(options: NewChatOptions = {}): Promise<Chat> {
    const now = Date.now();
    const chat: Chat = {
      id: createId(),
      title: '',
      createdAt: now,
      updatedAt: now,
      projectId: options.projectId ?? null,
      model: options.model ?? null,
      temporary: options.temporary ?? false,
      favorite: false,
      activeLeafId: null,
      titleLocked: false,
      context: { ...EMPTY_CONTEXT, files: [] },
    };
    this.messageSignals.set(chat.id, signal([]));
    this.chats.update((list) => [...list, chat]);
    await this.persistChat(chat);
    return chat;
  }

  updateChat(id: string, patch: Partial<Omit<Chat, 'id'>>, touch = true): void {
    let updated: Chat | undefined;
    this.chats.update((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, ...patch, updatedAt: touch ? Date.now() : c.updatedAt };
        return updated;
      }),
    );
    if (updated) void this.persistChat(updated);
  }

  rename(id: string, title: string): void {
    const clean = title.trim().slice(0, 120);
    this.updateChat(id, { title: clean, titleLocked: clean.length > 0 }, false);
  }

  toggleFavorite(id: string): void {
    const chat = this.chat(id);
    if (chat) this.updateChat(id, { favorite: !chat.favorite }, false);
  }

  setModel(id: string, model: ModelRef): void {
    this.updateChat(id, { model }, false);
  }

  setProject(id: string, projectId: string | null): void {
    const chat = this.chat(id);
    if (!chat || chat.projectId === projectId) return;
    this.updateChat(id, { projectId, context: { files: [], includeInstructions: true } }, false);
  }

  setContext(id: string, context: ChatContextSelection): void {
    this.updateChat(id, { context }, false);
  }

  addContextFiles(id: string, paths: readonly string[]): void {
    const chat = this.chat(id);
    if (!chat) return;
    const files = [...new Set([...chat.context.files, ...paths])];
    this.setContext(id, { ...chat.context, files });
  }

  removeContextFile(id: string, path: string): void {
    const chat = this.chat(id);
    if (!chat) return;
    this.setContext(id, { ...chat.context, files: chat.context.files.filter((f) => f !== path) });
  }

  async deleteChat(id: string): Promise<void> {
    const chat = this.chat(id);
    if (!chat) return;
    this.stop(id);
    this.chats.update((list) => list.filter((c) => c.id !== id));
    this.messageSignals.delete(id);
    if (chat.temporary) this.scheduleTempSave();
    else {
      await this.storage.delete('chats', id);
      await this.storage.deleteByIndex('messages', 'chatId', id);
    }
    this.messagesChanged.next(id);
  }

  async duplicateChat(id: string): Promise<Chat | null> {
    const source = this.chat(id);
    if (!source) return null;
    await this.ensureMessages(id);
    const idMap = new Map<string, string>();
    const messages = this.messageSignal(id)();
    for (const m of messages) idMap.set(m.id, createId());
    const now = Date.now();
    const copy: Chat = {
      ...source,
      id: createId(),
      title: `${source.title || this.i18n.t('chat.untitled')} ${this.i18n.t('chat.copySuffix')}`,
      titleLocked: true,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      activeLeafId: source.activeLeafId ? (idMap.get(source.activeLeafId) ?? null) : null,
    };
    const copiedMessages: Message[] = messages.map((m) => ({
      ...m,
      id: idMap.get(m.id) as string,
      chatId: copy.id,
      parentId: m.parentId ? (idMap.get(m.parentId) ?? null) : null,
      status: m.status === 'streaming' ? 'interrupted' : m.status,
    }));
    this.messageSignals.set(copy.id, signal(copiedMessages));
    this.chats.update((list) => [...list, copy]);
    await this.persistChat(copy);
    if (!copy.temporary) await this.storage.putMany('messages', copiedMessages);
    else this.scheduleTempSave();
    this.messagesChanged.next(copy.id);
    return copy;
  }

  /** Convierte un chat en temporal (lo borra de IndexedDB) o en permanente. */
  async setTemporary(id: string, temporary: boolean): Promise<void> {
    const chat = this.chat(id);
    if (!chat || chat.temporary === temporary) return;
    await this.ensureMessages(id);
    const messages = this.messageSignal(id)();
    this.chats.update((list) => list.map((c) => (c.id === id ? { ...c, temporary } : c)));
    if (temporary) {
      await this.storage.delete('chats', id);
      await this.storage.deleteByIndex('messages', 'chatId', id);
    } else {
      await this.storage.put('chats', { ...chat, temporary: false });
      await this.storage.putMany('messages', messages);
    }
    this.scheduleTempSave();
  }

  detachProject(projectId: string): void {
    for (const chat of this.chats()) if (chat.projectId === projectId) this.setProject(chat.id, null);
  }

  async clearHistory(): Promise<void> {
    for (const chat of this.history()) this.stop(chat.id);
    const ids = new Set(this.history().map((c) => c.id));
    this.chats.update((list) => list.filter((c) => !ids.has(c.id)));
    for (const id of ids) this.messageSignals.delete(id);
    await this.storage.clear('chats');
    await this.storage.clear('messages');
    for (const id of ids) this.messagesChanged.next(id);
  }

  /** Inserta chats/mensajes importados (ya validados). */
  async importChats(chats: readonly Chat[], messages: readonly Message[]): Promise<void> {
    const normalized = chats.map(normalizeChat).map((c) => ({ ...c, temporary: false }));
    await this.storage.putMany('chats', normalized);
    await this.storage.putMany('messages', messages);
    const ids = new Set(normalized.map((c) => c.id));
    for (const id of ids) this.messageSignals.delete(id);
    this.chats.update((list) => [...list.filter((c) => !ids.has(c.id)), ...normalized]);
    for (const id of ids) this.messagesChanged.next(id);
  }

  async allPersistentMessages(): Promise<Message[]> {
    return this.storage.getAll<Message>('messages');
  }

  // ------------------------------------------------------------- messages

  /** Rama activa del chat (raíz → hoja). */
  activePath(chatId: string): Message[] {
    const chat = this.chat(chatId);
    return chat ? getPathToLeaf(this.messageSignal(chatId)(), chat.activeLeafId) : [];
  }

  /** Envía un mensaje. Devuelve false si ya hay una generación en curso (evita dobles envíos). */
  async send(chatId: string, input: SendInput): Promise<boolean> {
    if (this.isGenerating(chatId)) return false;
    const chat = this.chat(chatId);
    if (!chat) return false;
    this.markGenerating(chatId, true);
    try {
      await this.ensureMessages(chatId);
    } catch {
      this.markGenerating(chatId, false);
      return false;
    }
    const current = this.chat(chatId) ?? chat;
    const now = Date.now();
    const userMessage: Message = {
      id: createId(),
      chatId,
      parentId: current.activeLeafId,
      role: 'user',
      content: input.text,
      attachments: input.attachments,
      createdAt: now,
      updatedAt: now,
      status: 'complete',
    };
    this.addMessage(userMessage);
    const patch: Partial<Chat> = { activeLeafId: userMessage.id };
    if (!current.titleLocked && !current.title) {
      patch.title = generateLocalTitle(input.text || input.attachments[0]?.name || '', this.i18n.t('chat.untitled'));
    }
    this.updateChat(chatId, patch);
    this.generate(chatId, userMessage.id);
    return true;
  }

  regenerate(chatId: string, assistantMessageId: string): boolean {
    const msg = this.findMessage(chatId, assistantMessageId);
    if (!msg || msg.role !== 'assistant' || !msg.parentId || this.isGenerating(chatId)) return false;
    this.generate(chatId, msg.parentId);
    return true;
  }

  /** Reintenta sobre el mismo mensaje fallido (no duplica mensajes). */
  retry(chatId: string, assistantMessageId: string): boolean {
    const msg = this.findMessage(chatId, assistantMessageId);
    if (!msg || msg.role !== 'assistant' || !msg.parentId || this.isGenerating(chatId)) return false;
    this.generate(chatId, msg.parentId, msg.id);
    return true;
  }

  /** Edita un mensaje de usuario creando una rama nueva; la rama anterior se conserva. */
  editAndResend(chatId: string, userMessageId: string, text: string): boolean {
    const original = this.findMessage(chatId, userMessageId);
    if (!original || original.role !== 'user' || this.isGenerating(chatId)) return false;
    const now = Date.now();
    const edited: Message = {
      ...original,
      id: createId(),
      content: text,
      createdAt: now,
      updatedAt: now,
      status: 'complete',
    };
    this.addMessage(edited);
    this.updateChat(chatId, { activeLeafId: edited.id });
    this.generate(chatId, edited.id);
    return true;
  }

  stop(chatId: string): void {
    const gen = this.generations.get(chatId);
    if (!gen) return;
    gen.cancelled = true;
    gen.subscription?.unsubscribe();
    this.finishGeneration(chatId, gen, { status: 'stopped' });
  }

  deleteMessage(chatId: string, messageId: string): void {
    const all = this.messageSignal(chatId)();
    const target = all.find((m) => m.id === messageId);
    if (!target) return;
    const ids = collectSubtree(all, messageId);
    const gen = this.generations.get(chatId);
    if (gen && ids.has(gen.messageId)) this.stop(chatId);
    const remaining = this.messageSignal(chatId)().filter((m) => !ids.has(m.id));
    this.messageSignal(chatId).set(remaining);
    const chat = this.chat(chatId);
    if (chat && chat.activeLeafId && ids.has(chat.activeLeafId)) {
      const index = buildChildrenIndex(remaining);
      const siblings = index.get(target.parentId) ?? [];
      const next = siblings.length ? deepestLeaf(remaining, siblings[siblings.length - 1].id, index) : target.parentId;
      this.updateChat(chatId, { activeLeafId: next }, false);
    }
    if (chat?.temporary) this.scheduleTempSave();
    else void this.storage.deleteMany('messages', [...ids]).catch(() => undefined);
    this.messagesChanged.next(chatId);
  }

  /** Cambia a la rama hermana anterior (-1) o siguiente (+1). */
  switchBranch(chatId: string, messageId: string, delta: -1 | 1): void {
    if (this.isGenerating(chatId)) return;
    const all = this.messageSignal(chatId)();
    const msg = all.find((m) => m.id === messageId);
    if (!msg) return;
    const siblings = getSiblings(all, msg);
    const idx = siblings.findIndex((s) => s.id === messageId);
    const target = siblings[idx + delta];
    if (!target) return;
    this.updateChat(chatId, { activeLeafId: deepestLeaf(all, target.id) }, false);
  }

  /** Fija la hoja activa en un mensaje anterior: el siguiente envío crea una rama nueva. */
  continueFrom(chatId: string, messageId: string): void {
    if (this.isGenerating(chatId)) return;
    this.updateChat(chatId, { activeLeafId: messageId }, false);
  }

  /** Vuelve a la hoja más reciente de la rama actual. */
  returnToLatest(chatId: string): void {
    const chat = this.chat(chatId);
    if (!chat) return;
    this.updateChat(chatId, { activeLeafId: deepestLeaf(this.messageSignal(chatId)(), chat.activeLeafId) }, false);
  }

  hasContinuation(chatId: string): boolean {
    const chat = this.chat(chatId);
    if (!chat?.activeLeafId) return false;
    return this.messageSignal(chatId)().some((m) => m.parentId === chat.activeLeafId);
  }

  // ----------------------------------------------------------- generation

  /** Resuelve el modelo del chat: el del chat, el predeterminado o el primero configurado. */
  resolveModelRef(chat: Chat): ModelRef | null {
    const candidates = [chat.model, this.settings.settings().defaultModel];
    for (const ref of candidates) {
      const found = this.providers.findModel(ref);
      if (found?.configured) return ref;
    }
    if (chat.model && this.providers.findModel(chat.model)) return chat.model;
    const first = this.providers.configuredModels()[0];
    return first ? { providerId: first.provider.id, modelId: first.model.id } : null;
  }

  private generate(chatId: string, userMessageId: string, reuseAssistantId?: string): void {
    const chat = this.chat(chatId);
    if (!chat) return;
    this.markGenerating(chatId, true);
    const modelRef = this.resolveModelRef(chat);
    const modelInfo = this.providers.findModel(modelRef);
    const now = Date.now();
    let assistantId = reuseAssistantId;
    const base: Partial<Message> = {
      content: '',
      status: 'streaming',
      error: undefined,
      usage: undefined,
      context: undefined,
      model: modelRef ?? undefined,
      modelName: modelInfo?.model.name,
      updatedAt: now,
    };
    if (assistantId && this.findMessage(chatId, assistantId)) {
      this.patchMessage(chatId, assistantId, base, true);
    } else {
      assistantId = createId();
      this.addMessage({
        id: assistantId,
        chatId,
        parentId: userMessageId,
        role: 'assistant',
        attachments: [],
        createdAt: now,
        ...(base as Pick<Message, 'content' | 'status' | 'updatedAt'>),
        model: modelRef ?? undefined,
        modelName: modelInfo?.model.name,
      });
    }
    this.updateChat(chatId, { activeLeafId: assistantId, model: chat.model ?? modelRef });

    const gen: ActiveGeneration = {
      token: createId(),
      messageId: assistantId,
      content: '',
      usage: {},
      subscription: null,
      cancelled: false,
      flushHandle: null,
      lastPersist: Date.now(),
    };
    this.generations.set(chatId, gen);
    void this.runGeneration(chatId, userMessageId, modelRef, gen);
  }

  private async runGeneration(
    chatId: string,
    userMessageId: string,
    modelRef: ModelRef | null,
    gen: ActiveGeneration,
  ): Promise<void> {
    try {
      if (!modelRef || !this.providers.findModel(modelRef)?.configured) {
        throw new AppError('not_configured', this.i18n.t('error.not_configured'), { localized: true });
      }
      const model = this.llm.resolveModel(modelRef);
      const chat = this.chat(chatId);
      if (!model || !chat)
        throw new AppError('not_configured', this.i18n.t('error.not_configured'), { localized: true });
      const path = getPathToLeaf(this.messageSignal(chatId)(), userMessageId);
      const built = await this.builder.build(chat, path, model);
      if (gen.cancelled || this.generations.get(chatId) !== gen) return;
      this.patchMessage(chatId, gen.messageId, { context: built.context }, false);
      const settings = this.settings.settings();
      gen.subscription = this.llm
        .generate({
          model: modelRef,
          system: built.system,
          messages: built.messages,
          stream: settings.streaming,
          maxOutputTokens: settings.maxOutputTokens,
        })
        .subscribe({
          next: (event) => this.onStreamEvent(chatId, gen, event),
          error: (error: unknown) => this.finishGeneration(chatId, gen, { status: 'error', error }),
          complete: () => {
            if (!gen.cancelled) this.finishGeneration(chatId, gen, { status: 'complete' });
          },
        });
    } catch (error) {
      this.finishGeneration(chatId, gen, { status: 'error', error });
    }
  }

  private onStreamEvent(chatId: string, gen: ActiveGeneration, event: ChatStreamEvent): void {
    if (this.generations.get(chatId) !== gen) return;
    if (event.type === 'token') {
      gen.content += event.text;
      if (gen.flushHandle === null) {
        gen.flushHandle = requestFrame(() => {
          gen.flushHandle = null;
          this.flush(chatId, gen);
        });
      }
    } else if (event.type === 'usage') {
      gen.usage = {
        inputTokens: event.usage.inputTokens ?? gen.usage.inputTokens,
        outputTokens: event.usage.outputTokens ?? gen.usage.outputTokens,
      };
    }
  }

  /** Vuelca el contenido acumulado al signal (una vez por frame) y persiste con throttle. */
  private flush(chatId: string, gen: ActiveGeneration): void {
    if (this.generations.get(chatId) !== gen) return;
    const now = Date.now();
    const persist = now - gen.lastPersist > PERSIST_INTERVAL_MS;
    if (persist) gen.lastPersist = now;
    this.patchMessage(chatId, gen.messageId, { content: gen.content, updatedAt: now }, persist);
  }

  private finishGeneration(
    chatId: string,
    gen: ActiveGeneration,
    result: { status: 'complete' | 'stopped' | 'error'; error?: unknown },
  ): void {
    if (this.generations.get(chatId) !== gen) return;
    if (gen.flushHandle !== null) {
      cancelFrame(gen.flushHandle);
      gen.flushHandle = null;
    }
    this.generations.delete(chatId);
    const hasUsage = gen.usage.inputTokens !== undefined || gen.usage.outputTokens !== undefined;
    const patch: Partial<Message> = {
      content: gen.content,
      status: result.status,
      updatedAt: Date.now(),
      usage: hasUsage ? gen.usage : undefined,
    };
    if (result.status === 'error') {
      const info = toAppErrorInfo(result.error, this.i18n.t('error.unknown'));
      if (info.code === 'aborted') patch.status = 'stopped';
      else patch.error = info;
    }
    this.patchMessage(chatId, gen.messageId, patch, true);
    if (hasUsage) this.updateChat(chatId, { lastUsage: gen.usage }, false);
    this.markGenerating(chatId, false);
    this.messagesChanged.next(chatId);
  }

  private markGenerating(chatId: string, on: boolean): void {
    this.generatingChats.update((set) => {
      const next = new Set(set);
      if (on) next.add(chatId);
      else next.delete(chatId);
      return next;
    });
  }

  // -------------------------------------------------------------- helpers

  private findMessage(chatId: string, id: string): Message | undefined {
    return this.messageSignal(chatId)().find((m) => m.id === id);
  }

  private addMessage(message: Message): void {
    this.messageSignal(message.chatId).update((list) => [...list, message]);
    void this.persistMessage(message);
    this.messagesChanged.next(message.chatId);
  }

  private patchMessage(chatId: string, id: string, patch: Partial<Message>, persist: boolean): void {
    let updated: Message | undefined;
    this.messageSignal(chatId).update((list) =>
      list.map((m) => {
        if (m.id !== id) return m;
        updated = { ...m, ...patch };
        return updated;
      }),
    );
    if (updated && persist) void this.persistMessage(updated);
  }

  private async persistChat(chat: Chat): Promise<void> {
    if (chat.temporary) {
      this.scheduleTempSave();
      return;
    }
    await this.storage.put('chats', chat).catch(() => undefined);
  }

  private async persistMessage(message: Message): Promise<void> {
    const chat = this.chat(message.chatId);
    if (!chat || chat.temporary) {
      this.scheduleTempSave();
      return;
    }
    await this.storage.put('messages', message).catch(() => undefined);
  }

  private scheduleTempSave(): void {
    this.temp.schedule(() => {
      const chats = this.temporaryChats();
      return { chats, messages: chats.flatMap((c) => this.messageSignals.get(c.id)?.() ?? []) };
    });
  }
}
