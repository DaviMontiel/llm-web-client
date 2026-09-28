import { TestBed } from '@angular/core/testing';
import { setupStorage } from '../../../testing/test-helpers';
import { I18nService } from '../i18n/i18n.service';
import { DEFAULT_SETTINGS } from '../models';
import { StorageService } from '../storage/storage.service';
import { ProviderConfigService } from '../llm/provider-config.service';
import { SettingsService, normalizeSettings } from './settings.service';

describe('normalizeSettings', () => {
  it('devuelve valores por defecto ante datos inválidos', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('basura').language).toBe('es');
  });

  it('valida tipos y límites', () => {
    const s = normalizeSettings({
      language: 'en',
      maxFileSizeMB: 99999,
      maxFiles: -3,
      enterToSend: 'yes',
      allowedExtensions: ['.TS', 'md', 3],
    });
    expect(s.language).toBe('en');
    expect(s.maxFileSizeMB).toBe(500);
    expect(s.maxFiles).toBe(1);
    expect(s.enterToSend).toBe(true);
    expect(s.allowedExtensions).toEqual(DEFAULT_SETTINGS.allowedExtensions);
    expect(normalizeSettings({ allowedExtensions: ['.TS', 'md'] }).allowedExtensions).toEqual(['ts', 'md']);
  });
});

describe('SettingsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    setupStorage();
  });

  it('persiste los cambios y los recupera', async () => {
    const service = TestBed.inject(SettingsService);
    service.update({ themeId: 'midnight', language: 'en' });
    await service.flush();
    const storage = TestBed.inject(StorageService);
    expect((await storage.get<{ themeId: string }>('kv', 'settings'))?.themeId).toBe('midnight');
    service.settings.set(normalizeSettings(null));
    await service.load();
    expect(service.settings().themeId).toBe('midnight');
  });

  it('aplica tema e idioma al documento', async () => {
    const service = TestBed.inject(SettingsService);
    service.update({ themeId: 'dark', language: 'en' });
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(TestBed.inject(I18nService).t('chat.new')).toBe('New chat');
  });
});

describe('ProviderConfigService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    setupStorage();
  });

  it('marca un proveedor como configurado con API key', () => {
    const providers = TestBed.inject(ProviderConfigService);
    expect(providers.isConfigured('anthropic')).toBe(false);
    providers.updateConfig('anthropic', { apiKey: 'k' });
    expect(providers.isConfigured('anthropic')).toBe(true);
    expect(providers.configuredModels().every((m) => m.provider.id === 'anthropic')).toBe(true);
  });

  it('no guarda en disco las claves de solo sesión', async () => {
    const providers = TestBed.inject(ProviderConfigService);
    providers.updateConfig('openai', { apiKey: 'secret', persistApiKey: false });
    await new Promise((r) => setTimeout(r, 10));
    const stored = await TestBed.inject(StorageService).get<{ configs: { providerId: string; apiKey: string }[] }>(
      'kv',
      'providers',
    );
    expect(stored?.configs.find((c) => c.providerId === 'openai')?.apiKey).toBe('');
    expect(sessionStorage.getItem('lwc.session-keys')).toContain('secret');
  });

  it('gestiona proveedores compatibles y modelos personalizados', () => {
    const providers = TestBed.inject(ProviderConfigService);
    const id = providers.addCustomProvider({
      name: 'Ollama',
      baseUrl: 'http://localhost:11434/v1',
      requiresApiKey: false,
    });
    expect(providers.isConfigured(id)).toBe(true);
    providers.addCustomModel(id, {
      id: 'qwen',
      name: 'Qwen',
      capabilities: { text: true, vision: false, files: true, streaming: true },
    });
    expect(providers.modelsFor(id).map((m) => m.id)).toEqual(['qwen']);
    providers.removeModel(id, 'qwen');
    expect(providers.modelsFor(id)).toEqual([]);
    providers.removeModel('anthropic', 'claude-opus-5-5');
    expect(providers.modelsFor('anthropic').some((m) => m.id === 'claude-opus-5-5')).toBe(false);
    providers.restoreHiddenModels('anthropic');
    expect(providers.modelsFor('anthropic').some((m) => m.id === 'claude-opus-5-5')).toBe(true);
    providers.removeCustomProvider(id);
    expect(providers.provider(id)).toBeUndefined();
  });
});
