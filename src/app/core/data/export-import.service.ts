import { Injectable, inject } from '@angular/core';
import { ChatStore } from '../chat/chat-store.service';
import { SearchService } from '../chat/search.service';
import { I18nService } from '../i18n/i18n.service';
import { ProviderConfigService } from '../llm/provider-config.service';
import { Attachment, Chat, CustomProviderDefinition, LLMModel, Message, Project, Settings } from '../models';
import { ProjectService } from '../projects/project.service';
import { SettingsService, normalizeSettings } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { createId } from '../utils/id';

export const EXPORT_FORMAT = 'llm-workspace-export';

export interface ExportedProviderConfig {
  providerId: string;
  enabled: boolean;
  baseUrl?: string;
  models: LLMModel[];
  hiddenModelIds: string[];
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  settings: Settings;
  providers: { custom: CustomProviderDefinition[]; configs: ExportedProviderConfig[] };
  projects: Project[];
  chats: Chat[];
  messages: Message[];
}

export type ConflictStrategy = 'skip' | 'replace' | 'duplicate';

export interface ImportPlan {
  file: ExportFile;
  newChats: number;
  existingChats: number;
  newProjects: number;
  existingProjects: number;
  messages: number;
  invalidEntries: number;
}

export interface ImportOptions {
  strategy: ConflictStrategy;
  importSettings: boolean;
}

// ------------------------------------------------------------ validación

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isValidAttachment(v: unknown): v is Attachment {
  return (
    isObj(v) &&
    isStr(v['id']) &&
    isStr(v['name']) &&
    isStr(v['mimeType']) &&
    isNum(v['size']) &&
    (v['kind'] === 'image' || v['kind'] === 'text' || v['kind'] === 'binary') &&
    (v['textContent'] === undefined || isStr(v['textContent'])) &&
    (v['dataBase64'] === undefined ||
      (isStr(v['dataBase64']) && /^[A-Za-z0-9+/=]*$/.test(v['dataBase64'].slice(0, 200))))
  );
}

export function isValidMessage(v: unknown): v is Message {
  return (
    isObj(v) &&
    isStr(v['id']) &&
    isStr(v['chatId']) &&
    (v['parentId'] === null || isStr(v['parentId'])) &&
    (v['role'] === 'user' || v['role'] === 'assistant') &&
    isStr(v['content']) &&
    Array.isArray(v['attachments']) &&
    v['attachments'].every(isValidAttachment) &&
    isNum(v['createdAt']) &&
    isStr(v['status'])
  );
}

export function isValidChat(v: unknown): v is Chat {
  return isObj(v) && isStr(v['id']) && isStr(v['title']) && isNum(v['createdAt']) && isNum(v['updatedAt']);
}

export function isValidProject(v: unknown): v is Project {
  return isObj(v) && isStr(v['id']) && isStr(v['name']) && isNum(v['createdAt']);
}

function sanitizeProject(p: Project): Project {
  return {
    id: p.id,
    name: p.name.slice(0, 200),
    description: isStr(p.description) ? p.description : '',
    instructions: isStr(p.instructions) ? p.instructions : '',
    ignorePatterns: Array.isArray(p.ignorePatterns) ? p.ignorePatterns.filter(isStr) : [],
    defaultModel:
      p.defaultModel && isStr(p.defaultModel.providerId) && isStr(p.defaultModel.modelId) ? p.defaultModel : null,
    // Los handles de carpeta no son exportables: el proyecto se importa sin carpeta.
    source: 'none',
    rootName: isStr(p.rootName) ? p.rootName : null,
    createdAt: p.createdAt,
    updatedAt: isNum(p.updatedAt) ? p.updatedAt : p.createdAt,
  };
}

function sanitizeMessage(m: Message): Message {
  const statuses = ['complete', 'streaming', 'stopped', 'interrupted', 'error'];
  return {
    ...m,
    status: m.status === 'streaming' ? 'interrupted' : statuses.includes(m.status) ? m.status : 'complete',
    updatedAt: isNum(m.updatedAt) ? m.updatedAt : m.createdAt,
  };
}

/** Valida un JSON importado. Lanza Error con mensaje legible si el formato no es válido. */
export function parseExportFile(text: string): { file: ExportFile; invalid: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('invalid-json');
  }
  if (!isObj(raw) || raw['format'] !== EXPORT_FORMAT || raw['version'] !== 1) throw new Error('invalid-format');
  let invalid = 0;
  const pick = <T>(list: unknown, guard: (v: unknown) => v is T): T[] => {
    if (!Array.isArray(list)) return [];
    const ok = list.filter(guard);
    invalid += list.length - ok.length;
    return ok;
  };
  const chats = pick(raw['chats'], isValidChat);
  const chatIds = new Set(chats.map((c) => c.id));
  const messages = pick(raw['messages'], isValidMessage)
    .filter((m) => chatIds.has(m.chatId))
    .map(sanitizeMessage);
  const projects = pick(raw['projects'], isValidProject).map(sanitizeProject);
  const providersRaw = isObj(raw['providers']) ? raw['providers'] : {};
  const custom = Array.isArray(providersRaw['custom'])
    ? providersRaw['custom'].filter(
        (c): c is CustomProviderDefinition => isObj(c) && isStr(c['id']) && isStr(c['name']) && isStr(c['baseUrl']),
      )
    : [];
  const configs = Array.isArray(providersRaw['configs'])
    ? providersRaw['configs']
        .filter((c): c is Record<string, unknown> => isObj(c) && isStr(c['providerId']))
        .map<ExportedProviderConfig>((c) => ({
          providerId: c['providerId'] as string,
          enabled: c['enabled'] !== false,
          baseUrl: isStr(c['baseUrl']) ? c['baseUrl'] : undefined,
          models: Array.isArray(c['models'])
            ? (c['models'].filter((m) => isObj(m) && isStr(m['id']) && isStr(m['name'])) as LLMModel[])
            : [],
          hiddenModelIds: Array.isArray(c['hiddenModelIds']) ? c['hiddenModelIds'].filter(isStr) : [],
        }))
    : [];
  return {
    file: {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: isStr(raw['exportedAt']) ? raw['exportedAt'] : '',
      settings: normalizeSettings(raw['settings']),
      providers: { custom, configs },
      projects,
      chats,
      messages,
    },
    invalid,
  };
}

@Injectable({ providedIn: 'root' })
export class ExportImportService {
  private readonly chats = inject(ChatStore);
  private readonly projects = inject(ProjectService);
  private readonly settings = inject(SettingsService);
  private readonly providers = inject(ProviderConfigService);
  private readonly storage = inject(StorageService);
  private readonly search = inject(SearchService);
  private readonly i18n = inject(I18nService);

  /** Exporta todo salvo datos sensibles (API keys) y chats temporales. */
  async buildExport(): Promise<ExportFile> {
    const messages = await this.chats.allPersistentMessages();
    return {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settings.settings(),
      providers: {
        custom: this.providers.customProviders(),
        configs: Object.values(this.providers.configs()).map((c) => ({
          providerId: c.providerId,
          enabled: c.enabled,
          baseUrl: c.baseUrl,
          models: c.models,
          hiddenModelIds: c.hiddenModelIds,
        })),
      },
      projects: this.projects.projects().map((p) => ({ ...p })),
      chats: this.chats.history(),
      messages,
    };
  }

  plan(text: string): ImportPlan {
    const { file, invalid } = parseExportFile(text);
    const existingChatIds = new Set(this.chats.chats().map((c) => c.id));
    const existingProjectIds = new Set(this.projects.projects().map((p) => p.id));
    const existingChats = file.chats.filter((c) => existingChatIds.has(c.id)).length;
    const existingProjects = file.projects.filter((p) => existingProjectIds.has(p.id)).length;
    return {
      file,
      newChats: file.chats.length - existingChats,
      existingChats,
      newProjects: file.projects.length - existingProjects,
      existingProjects,
      messages: file.messages.length,
      invalidEntries: invalid,
    };
  }

  async apply(plan: ImportPlan, options: ImportOptions): Promise<{ chats: number; projects: number }> {
    const { file } = plan;
    const existingChatIds = new Set(this.chats.chats().map((c) => c.id));
    const existingProjectIds = new Set(this.projects.projects().map((p) => p.id));
    const projectIdMap = new Map<string, string>();

    const projects: Project[] = [];
    for (const p of file.projects) {
      if (!existingProjectIds.has(p.id)) projects.push(p);
      else if (options.strategy === 'replace') projects.push(p);
      else if (options.strategy === 'duplicate') {
        const id = createId();
        projectIdMap.set(p.id, id);
        projects.push({ ...p, id, name: `${p.name} ${this.i18n.t('chat.importedSuffix')}` });
      }
    }
    if (projects.length) {
      await this.storage.putMany('projects', projects);
      await this.projects.load();
    }

    const chats: Chat[] = [];
    const messages: Message[] = [];
    for (const chat of file.chats) {
      const chatMessages = file.messages.filter((m) => m.chatId === chat.id);
      const projectId = chat.projectId ? (projectIdMap.get(chat.projectId) ?? chat.projectId) : null;
      if (!existingChatIds.has(chat.id) || options.strategy === 'replace') {
        if (existingChatIds.has(chat.id)) await this.chats.deleteChat(chat.id);
        chats.push({ ...chat, projectId });
        messages.push(...chatMessages);
      } else if (options.strategy === 'duplicate') {
        const newChatId = createId();
        const idMap = new Map(chatMessages.map((m) => [m.id, createId()] as const));
        chats.push({
          ...chat,
          id: newChatId,
          projectId,
          title: `${chat.title || this.i18n.t('chat.untitled')} ${this.i18n.t('chat.importedSuffix')}`,
          activeLeafId: chat.activeLeafId ? (idMap.get(chat.activeLeafId) ?? null) : null,
        });
        messages.push(
          ...chatMessages.map((m) => ({
            ...m,
            id: idMap.get(m.id) as string,
            chatId: newChatId,
            parentId: m.parentId ? (idMap.get(m.parentId) ?? null) : null,
          })),
        );
      }
    }
    if (chats.length) await this.chats.importChats(chats, messages);

    if (options.importSettings) {
      const current = this.settings.settings();
      this.settings.update({ ...file.settings, onboarded: current.onboarded });
      this.providers.importCustomProviders(file.providers.custom);
      for (const cfg of file.providers.configs) {
        if (!this.providers.provider(cfg.providerId)) continue;
        const existing = this.providers.config(cfg.providerId);
        this.providers.updateConfig(cfg.providerId, {
          enabled: cfg.enabled,
          baseUrl: cfg.baseUrl,
          models: cfg.models.map((m) => ({ ...m, providerId: cfg.providerId })),
          hiddenModelIds: cfg.hiddenModelIds,
          apiKey: existing.apiKey,
        });
      }
    }
    this.search.reset();
    return { chats: chats.length, projects: projects.length };
  }

  /** Exporta la rama activa de un chat como Markdown legible. */
  async chatToMarkdown(chatId: string): Promise<string> {
    await this.chats.ensureMessages(chatId);
    const chat = this.chats.chat(chatId);
    if (!chat) return '';
    const lines = [`# ${chat.title || this.i18n.t('chat.untitled')}`, ''];
    for (const m of this.chats.activePath(chatId)) {
      const who = m.role === 'user' ? this.i18n.t('message.you') : (m.modelName ?? this.i18n.t('message.assistant'));
      lines.push(`## ${who}`, '', m.content, '');
      for (const a of m.attachments) lines.push(`- ${this.i18n.t('message.attachment')}: ${a.path ?? a.name}`);
      if (m.attachments.length) lines.push('');
    }
    return lines.join('\n');
  }
}
