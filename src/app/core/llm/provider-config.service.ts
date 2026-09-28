import { Injectable, computed, inject, signal } from '@angular/core';
import { CustomProviderDefinition, LLMModel, LLMProvider, ModelRef, ProviderConfig } from '../models';
import { StorageService } from '../storage/storage.service';
import { createId } from '../utils/id';
import { BUILTIN_PROVIDERS } from './provider-catalog';

const KV_KEY = 'providers';
const SESSION_KEYS = 'lwc.session-keys';

interface PersistedProviders {
  custom: CustomProviderDefinition[];
  configs: ProviderConfig[];
}

export interface AvailableModel {
  provider: LLMProvider;
  model: LLMModel;
  configured: boolean;
}

function defaultConfig(providerId: string): ProviderConfig {
  return { providerId, enabled: true, apiKey: '', persistApiKey: true, models: [], hiddenModelIds: [] };
}

function isModel(v: unknown): v is LLMModel {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m['id'] === 'string' && typeof m['name'] === 'string' && typeof m['capabilities'] === 'object';
}

function sanitizeConfig(raw: unknown): ProviderConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['providerId'] !== 'string') return null;
  const providerId = r['providerId'];
  return {
    providerId,
    enabled: r['enabled'] !== false,
    apiKey: typeof r['apiKey'] === 'string' ? r['apiKey'] : '',
    persistApiKey: r['persistApiKey'] !== false,
    baseUrl: typeof r['baseUrl'] === 'string' && r['baseUrl'] ? r['baseUrl'] : undefined,
    models: Array.isArray(r['models']) ? r['models'].filter(isModel).map((m) => ({ ...m, providerId })) : [],
    hiddenModelIds: Array.isArray(r['hiddenModelIds'])
      ? r['hiddenModelIds'].filter((x): x is string => typeof x === 'string')
      : [],
    lastSyncedAt: typeof r['lastSyncedAt'] === 'number' ? r['lastSyncedAt'] : undefined,
  };
}

/**
 * Configuración de proveedores (API keys, URL base, modelos). Las API keys
 * se guardan en IndexedDB en claro (el navegador no ofrece un almacén
 * secreto para apps web) o, si el usuario lo prefiere, solo en sessionStorage.
 */
@Injectable({ providedIn: 'root' })
export class ProviderConfigService {
  private readonly storage = inject(StorageService);

  readonly customProviders = signal<CustomProviderDefinition[]>([]);
  readonly configs = signal<Record<string, ProviderConfig>>({});

  readonly providers = computed<LLMProvider[]>(() => [
    ...BUILTIN_PROVIDERS,
    ...this.customProviders().map<LLMProvider>((c) => ({
      id: c.id,
      name: c.name,
      kind: 'openai-compatible',
      description: 'OpenAI-compatible · Chat Completions',
      defaultBaseUrl: c.baseUrl,
      requiresApiKey: c.requiresApiKey,
      custom: true,
      browserNote: 'cors.compatible',
      models: [],
    })),
  ]);

  /** Todos los modelos visibles con su estado de configuración. */
  readonly allModels = computed<AvailableModel[]>(() =>
    this.providers().flatMap((provider) => {
      const configured = this.isConfigured(provider.id);
      return this.modelsFor(provider.id).map((model) => ({ provider, model, configured }));
    }),
  );

  readonly configuredModels = computed(() => this.allModels().filter((m) => m.configured));
  readonly hasConfiguredProvider = computed(() => this.providers().some((p) => this.isConfigured(p.id)));

  async load(): Promise<void> {
    const raw = await this.storage.get<PersistedProviders>('kv', KV_KEY).catch(() => undefined);
    const custom = Array.isArray(raw?.custom)
      ? raw.custom.filter(
          (c) => typeof c?.id === 'string' && typeof c.name === 'string' && typeof c.baseUrl === 'string',
        )
      : [];
    const configs: Record<string, ProviderConfig> = {};
    for (const c of Array.isArray(raw?.configs) ? raw.configs : []) {
      const cfg = sanitizeConfig(c);
      if (cfg) configs[cfg.providerId] = cfg;
    }
    for (const [providerId, key] of Object.entries(this.readSessionKeys())) {
      if (configs[providerId]) configs[providerId] = { ...configs[providerId], apiKey: key };
    }
    this.customProviders.set(custom);
    this.configs.set(configs);
  }

  provider(providerId: string): LLMProvider | undefined {
    return this.providers().find((p) => p.id === providerId);
  }

  config(providerId: string): ProviderConfig {
    return this.configs()[providerId] ?? defaultConfig(providerId);
  }

  baseUrl(providerId: string): string {
    const provider = this.provider(providerId);
    return (this.config(providerId).baseUrl || provider?.defaultBaseUrl || '').trim();
  }

  isConfigured(providerId: string): boolean {
    const provider = this.provider(providerId);
    const cfg = this.configs()[providerId];
    if (!provider || !cfg || !cfg.enabled) return false;
    if (provider.requiresApiKey && !cfg.apiKey.trim()) return false;
    return this.baseUrl(providerId).length > 0;
  }

  /** Modelos del catálogo (menos los ocultos) + sincronizados + personalizados. */
  modelsFor(providerId: string): LLMModel[] {
    const provider = this.provider(providerId);
    if (!provider) return [];
    const cfg = this.config(providerId);
    const byId = new Map<string, LLMModel>();
    for (const m of provider.models) if (!cfg.hiddenModelIds.includes(m.id)) byId.set(m.id, m);
    for (const m of cfg.models) if (!cfg.hiddenModelIds.includes(m.id)) byId.set(m.id, m);
    return [...byId.values()];
  }

  findModel(ref: ModelRef | null | undefined): AvailableModel | null {
    if (!ref) return null;
    return this.allModels().find((m) => m.provider.id === ref.providerId && m.model.id === ref.modelId) ?? null;
  }

  updateConfig(providerId: string, patch: Partial<ProviderConfig>): void {
    this.configs.update((all) => ({ ...all, [providerId]: { ...this.config(providerId), ...patch, providerId } }));
    void this.persist();
  }

  setSyncedModels(providerId: string, models: LLMModel[]): void {
    const custom = this.config(providerId).models.filter((m) => m.origin === 'custom');
    const ids = new Set(custom.map((m) => m.id));
    this.updateConfig(providerId, {
      models: [...models.filter((m) => !ids.has(m.id)), ...custom],
      lastSyncedAt: Date.now(),
    });
  }

  addCustomModel(providerId: string, model: Omit<LLMModel, 'providerId' | 'origin'>): void {
    const cfg = this.config(providerId);
    const models = cfg.models.filter((m) => m.id !== model.id);
    models.push({ ...model, providerId, origin: 'custom' });
    this.updateConfig(providerId, { models, hiddenModelIds: cfg.hiddenModelIds.filter((id) => id !== model.id) });
  }

  updateModel(providerId: string, model: LLMModel): void {
    const cfg = this.config(providerId);
    const models = cfg.models.filter((m) => m.id !== model.id);
    models.push({ ...model, providerId });
    this.updateConfig(providerId, { models });
  }

  removeModel(providerId: string, modelId: string): void {
    const cfg = this.config(providerId);
    const inCatalog = this.provider(providerId)?.models.some((m) => m.id === modelId) ?? false;
    const synced = cfg.models.find((m) => m.id === modelId)?.origin === 'synced';
    this.updateConfig(providerId, {
      models: cfg.models.filter((m) => m.id !== modelId),
      hiddenModelIds: inCatalog || synced ? [...new Set([...cfg.hiddenModelIds, modelId])] : cfg.hiddenModelIds,
    });
  }

  restoreHiddenModels(providerId: string): void {
    this.updateConfig(providerId, { hiddenModelIds: [] });
  }

  addCustomProvider(def: Omit<CustomProviderDefinition, 'id'>): string {
    const id = `custom-${createId().slice(0, 8)}`;
    this.customProviders.update((list) => [...list, { ...def, id }]);
    this.configs.update((all) => ({ ...all, [id]: { ...defaultConfig(id), baseUrl: def.baseUrl } }));
    void this.persist();
    return id;
  }

  /** Añade definiciones importadas que no existan todavía. */
  importCustomProviders(defs: readonly CustomProviderDefinition[]): void {
    const existing = new Set(this.providers().map((p) => p.id));
    const fresh = defs.filter((d) => !existing.has(d.id));
    if (fresh.length === 0) return;
    this.customProviders.update((list) => [...list, ...fresh]);
    void this.persist();
  }

  updateCustomProvider(id: string, patch: Partial<Omit<CustomProviderDefinition, 'id'>>): void {
    this.customProviders.update((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    void this.persist();
  }

  removeCustomProvider(id: string): void {
    this.customProviders.update((list) => list.filter((c) => c.id !== id));
    this.configs.update((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    void this.persist();
  }

  async clearAll(): Promise<void> {
    this.customProviders.set([]);
    this.configs.set({});
    this.writeSessionKeys({});
    await this.persist();
  }

  private async persist(): Promise<void> {
    const sessionKeys: Record<string, string> = {};
    const configs = Object.values(this.configs()).map((c) => {
      if (c.persistApiKey) return c;
      if (c.apiKey) sessionKeys[c.providerId] = c.apiKey;
      return { ...c, apiKey: '' };
    });
    this.writeSessionKeys(sessionKeys);
    await this.storage
      .put<PersistedProviders>('kv', { custom: this.customProviders(), configs }, KV_KEY)
      .catch(() => undefined);
  }

  private readSessionKeys(): Record<string, string> {
    try {
      const raw = sessionStorage.getItem(SESSION_KEYS);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (typeof parsed !== 'object' || parsed === null) return {};
      return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'));
    } catch {
      return {};
    }
  }

  private writeSessionKeys(keys: Record<string, string>): void {
    try {
      if (Object.keys(keys).length === 0) sessionStorage.removeItem(SESSION_KEYS);
      else sessionStorage.setItem(SESSION_KEYS, JSON.stringify(keys));
    } catch {
      /* sessionStorage no disponible: la clave vive solo en memoria. */
    }
  }
}
