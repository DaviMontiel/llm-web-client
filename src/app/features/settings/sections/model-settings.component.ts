import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { COMPATIBLE_PRESETS, CompatiblePreset } from '../../../core/llm/provider-catalog';
import { ProviderConfigService } from '../../../core/llm/provider-config.service';
import { ModelRef } from '../../../core/models';
import { SettingsService } from '../../../core/settings/settings.service';
import { MenuService } from '../../../core/ui/menu.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ModelPickerComponent } from '../../chat/model-picker/model-picker.component';
import { ProviderCardComponent } from './provider-card.component';

@Component({
  selector: 'app-model-settings',
  imports: [TPipe, IconComponent, ProviderCardComponent, ModelPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.css',
  template: `
    <div class="section-head">
      <h2>{{ 'settings.nav.models' | t }}</h2>
      <p>{{ 'settings.models.desc' | t }}</p>
    </div>

    <div class="notice notice-warning security" role="note">
      <app-icon name="shield-alert" [size]="16" />
      <div>
        <strong>{{ 'security.title' | t }}</strong>
        <p>{{ 'security.apiKeys' | t }}</p>
      </div>
    </div>

    <div class="group">
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.defaultModel' | t }}</p>
          <p class="setting-desc">{{ 'settings.defaultModelDesc' | t }}</p>
        </div>
        <div class="control">
          <app-model-picker [value]="settings.settings().defaultModel" (changed)="setDefault($event)" />
        </div>
      </div>
    </div>

    <div class="providers">
      @for (p of providers.providers(); track p.id) {
        <app-provider-card [provider]="p" />
      }
    </div>

    <div class="add">
      <button type="button" class="btn" (click)="addMenu($event)" aria-haspopup="menu">
        <app-icon name="plus" [size]="14" /> {{ 'provider.addCompatible' | t }}
      </button>
      <p class="field-hint">{{ 'provider.addCompatibleHint' | t }}</p>
    </div>
    @if (justAdded()) {
      <p class="field-hint added" role="status">{{ 'provider.added' | t }}</p>
    }
  `,
  styles: `
    .security {
      margin-bottom: 16px;
    }
    .security p {
      margin-top: 2px;
    }
    .providers {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .add {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .added {
      margin-top: 8px;
      color: var(--success);
    }
  `,
})
export class ModelSettingsComponent {
  protected readonly providers = inject(ProviderConfigService);
  protected readonly settings = inject(SettingsService);
  private readonly menu = inject(MenuService);
  private readonly i18n = inject(I18nService);
  protected readonly justAdded = signal(false);

  protected setDefault(ref: ModelRef): void {
    this.settings.update({ defaultModel: ref });
  }

  protected addMenu(event: MouseEvent): void {
    this.menu.toggleAt(
      event.currentTarget as HTMLElement,
      COMPATIBLE_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.id === 'custom' ? this.i18n.t('provider.customPreset') : preset.name,
        hint: preset.id === 'custom' ? undefined : preset.baseUrl.replace(/^https?:\/\//, ''),
        icon: preset.requiresApiKey ? 'globe' : 'server',
        run: () => this.add(preset),
      })),
      this.i18n.t('provider.addCompatible'),
      'start',
    );
  }

  private add(preset: CompatiblePreset): void {
    this.providers.addCustomProvider({
      name: preset.id === 'custom' ? this.i18n.t('provider.customName') : preset.name,
      baseUrl: preset.baseUrl,
      requiresApiKey: preset.requiresApiKey,
    });
    this.justAdded.set(true);
    setTimeout(() => this.justAdded.set(false), 3000);
  }
}
