import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/es';
import { TPipe } from '../../../core/i18n/t.pipe';
import { LlmService } from '../../../core/llm/llm.service';
import { ProviderConfigService } from '../../../core/llm/provider-config.service';
import { AppError, AppErrorCode, LLMModel, LLMProvider } from '../../../core/models';
import { DialogService } from '../../../core/ui/dialog.service';
import { ToastService } from '../../../core/ui/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { SwitchComponent } from '../../../shared/components/switch/switch.component';
import { ShortDatePipe, TokensPipe } from '../../../shared/pipes/format.pipes';

type TestState = 'idle' | 'loading' | 'success' | 'error';

/** Tarjeta de configuración de un proveedor: API key, URL base, modelos. */
@Component({
  selector: 'app-provider-card',
  imports: [TPipe, IconComponent, SwitchComponent, TokensPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-card.component.html',
  styleUrl: './provider-card.component.css',
})
export class ProviderCardComponent {
  private readonly providers = inject(ProviderConfigService);
  private readonly llm = inject(LlmService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(I18nService);

  readonly provider = input.required<LLMProvider>();

  protected readonly expanded = signal(false);
  protected readonly showKey = signal(false);
  protected readonly testState = signal<TestState>('idle');
  protected readonly testMessage = signal('');
  protected readonly syncing = signal(false);
  protected readonly addingModel = signal(false);
  protected readonly newModelId = signal('');
  protected readonly newModelName = signal('');
  protected readonly newModelContext = signal('');
  protected readonly newModelVision = signal(false);

  protected readonly config = computed(() => this.providers.config(this.provider().id));
  protected readonly configured = computed(() => this.providers.isConfigured(this.provider().id));
  protected readonly models = computed(() => this.providers.modelsFor(this.provider().id));
  protected readonly hiddenCount = computed(() => this.config().hiddenModelIds.length);
  protected readonly baseUrl = computed(() => this.config().baseUrl ?? '');
  protected readonly corsKey = computed<TranslationKey>(() => {
    switch (this.provider().browserNote) {
      case 'cors.anthropic':
        return 'cors.anthropic';
      case 'cors.openai':
        return 'cors.openai';
      case 'cors.google':
        return 'cors.google';
      default:
        return 'cors.compatible';
    }
  });

  protected setKey(value: string): void {
    this.providers.updateConfig(this.provider().id, { apiKey: value.trim() });
    this.testState.set('idle');
  }

  protected setPersist(persist: boolean): void {
    this.providers.updateConfig(this.provider().id, { persistApiKey: persist });
  }

  protected setEnabled(enabled: boolean): void {
    this.providers.updateConfig(this.provider().id, { enabled });
  }

  protected setBaseUrl(value: string): void {
    const v = value.trim();
    this.providers.updateConfig(this.provider().id, {
      baseUrl: v && v !== this.provider().defaultBaseUrl ? v : undefined,
    });
    if (this.provider().custom && v) this.providers.updateCustomProvider(this.provider().id, { baseUrl: v });
  }

  protected rename(value: string): void {
    if (this.provider().custom && value.trim())
      this.providers.updateCustomProvider(this.provider().id, { name: value.trim() });
  }

  protected setRequiresKey(value: boolean): void {
    if (this.provider().custom) this.providers.updateCustomProvider(this.provider().id, { requiresApiKey: value });
  }

  private errorKey(code: AppErrorCode): TranslationKey {
    return `error.${code}` as TranslationKey;
  }

  protected async test(): Promise<void> {
    if (!this.ensureConfig()) return;
    this.testState.set('loading');
    try {
      const models = await this.llm.listModels(this.provider().id);
      this.testState.set('success');
      this.testMessage.set(this.i18n.t('provider.testOk', { n: models.length }));
    } catch (error) {
      this.testState.set('error');
      const info = error instanceof AppError ? error : null;
      this.testMessage.set(
        `${this.i18n.t(this.errorKey(info?.code ?? 'unknown'))}${info?.options.detail ? ` — ${info.options.detail}` : ''}`,
      );
    }
  }

  protected async sync(): Promise<void> {
    if (!this.ensureConfig()) return;
    this.syncing.set(true);
    try {
      const n = await this.llm.syncModels(this.provider().id);
      this.toast.success(this.i18n.t('provider.synced', { n }));
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'unknown';
      this.toast.error(this.i18n.t(this.errorKey(code)), {
        detail: error instanceof AppError ? error.options.detail : undefined,
      });
    } finally {
      this.syncing.set(false);
    }
  }

  private ensureConfig(): boolean {
    if (!this.configured()) {
      this.toast.warning(this.i18n.t('provider.needKey'));
      return false;
    }
    return true;
  }

  protected toggleVision(model: LLMModel): void {
    this.providers.updateModel(this.provider().id, {
      ...model,
      capabilities: { ...model.capabilities, vision: !model.capabilities.vision },
      origin: model.origin === 'catalog' ? 'custom' : model.origin,
    });
  }

  protected toggleStreaming(model: LLMModel): void {
    this.providers.updateModel(this.provider().id, {
      ...model,
      capabilities: { ...model.capabilities, streaming: !model.capabilities.streaming },
      origin: model.origin === 'catalog' ? 'custom' : model.origin,
    });
  }

  protected originKey(model: LLMModel): `provider.origin.${LLMModel['origin']}` {
    return `provider.origin.${model.origin}`;
  }

  protected restoreHidden(): void {
    this.providers.restoreHiddenModels(this.provider().id);
  }

  protected removeModel(model: LLMModel): void {
    this.providers.removeModel(this.provider().id, model.id);
  }

  protected addModel(): void {
    const id = this.newModelId().trim();
    if (!id) return;
    const ctx = Number.parseInt(this.newModelContext().replace(/[^\d]/g, ''), 10);
    this.providers.addCustomModel(this.provider().id, {
      id,
      name: this.newModelName().trim() || id,
      capabilities: { text: true, vision: this.newModelVision(), files: true, streaming: true },
      contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : undefined,
    });
    this.newModelId.set('');
    this.newModelName.set('');
    this.newModelContext.set('');
    this.newModelVision.set(false);
    this.addingModel.set(false);
  }

  protected async removeProvider(): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('provider.removeTitle'),
      message: this.i18n.t('provider.removeMessage', { name: this.provider().name }),
      confirmLabel: this.i18n.t('common.delete'),
      danger: true,
    });
    if (ok) this.providers.removeCustomProvider(this.provider().id);
  }
}
