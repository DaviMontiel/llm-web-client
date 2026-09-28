import { Injectable, effect, inject, signal } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { DEFAULT_SETTINGS, Language, MotionPreference, Settings } from '../models';
import { StorageService } from '../storage/storage.service';
import { ThemeService } from '../theme/theme.service';

const SETTINGS_KEY = 'settings';

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Valida y completa unos Settings desconocidos (almacenados o importados). */
export function normalizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return { ...d, ignorePatterns: [...d.ignorePatterns] };
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  const lang: Language = r.language === 'en' ? 'en' : 'es';
  const motion: MotionPreference = r.motion === 'full' || r.motion === 'reduced' ? r.motion : 'system';
  const dm = r.defaultModel as { providerId?: unknown; modelId?: unknown } | null | undefined;
  return {
    version: 1,
    language: lang,
    themeId: typeof r.themeId === 'string' ? r.themeId : d.themeId,
    motion,
    enterToSend: typeof r.enterToSend === 'boolean' ? r.enterToSend : d.enterToSend,
    autoScroll: typeof r.autoScroll === 'boolean' ? r.autoScroll : d.autoScroll,
    streaming: typeof r.streaming === 'boolean' ? r.streaming : d.streaming,
    defaultModel:
      dm && typeof dm.providerId === 'string' && typeof dm.modelId === 'string'
        ? { providerId: dm.providerId, modelId: dm.modelId }
        : null,
    temporaryByDefault: typeof r.temporaryByDefault === 'boolean' ? r.temporaryByDefault : d.temporaryByDefault,
    systemPrompt: typeof r.systemPrompt === 'string' ? r.systemPrompt : d.systemPrompt,
    maxOutputTokens: Math.round(clampNumber(r.maxOutputTokens, 256, 1_000_000, d.maxOutputTokens)),
    maxFileSizeMB: clampNumber(r.maxFileSizeMB, 0.1, 500, d.maxFileSizeMB),
    maxFiles: Math.round(clampNumber(r.maxFiles, 1, 200, d.maxFiles)),
    maxContextKB: Math.round(clampNumber(r.maxContextKB, 8, 20_000, d.maxContextKB)),
    maxMessageChars: Math.round(clampNumber(r.maxMessageChars, 1000, 2_000_000, d.maxMessageChars)),
    allowedExtensions: isStringArray(r.allowedExtensions)
      ? r.allowedExtensions.map((e) => e.replace(/^\./, '').toLowerCase()).filter(Boolean)
      : [...d.allowedExtensions],
    ignorePatterns: isStringArray(r.ignorePatterns) ? r.ignorePatterns : [...d.ignorePatterns],
    onboarded: typeof r.onboarded === 'boolean' ? r.onboarded : d.onboarded,
  };
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storage = inject(StorageService);
  private readonly theme = inject(ThemeService);
  private readonly i18n = inject(I18nService);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  readonly settings = signal<Settings>(normalizeSettings(null));
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  constructor() {
    // Guardar cambios pendientes si la pestaña se oculta o se cierra.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        if (this.saveTimer) void this.flush();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && this.saveTimer) void this.flush();
      });
    }
    effect(() => {
      const s = this.settings();
      this.theme.apply(s.themeId, this.loaded);
      this.theme.applyMotion(s.motion);
      this.i18n.setLanguage(s.language);
    });
  }

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      const raw = await this.storage.get<unknown>('kv', SETTINGS_KEY);
      this.settings.set(normalizeSettings(raw));
      this.status.set('ready');
    } catch {
      this.status.set('error');
    } finally {
      this.loaded = true;
    }
  }

  update(patch: Partial<Settings>): void {
    this.settings.update((s) => normalizeSettings({ ...s, ...patch }));
    this.scheduleSave();
  }

  reset(): void {
    const onboarded = this.settings().onboarded;
    this.settings.set({ ...normalizeSettings(null), onboarded });
    this.scheduleSave();
  }

  /** Persistencia con debounce para no escribir en cada pulsación de teclado. */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 250);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await this.storage.put('kv', this.settings(), SETTINGS_KEY);
    } catch {
      this.status.set('error');
    }
  }
}
