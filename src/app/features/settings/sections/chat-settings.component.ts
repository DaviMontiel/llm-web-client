import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ChatStore } from '../../../core/chat/chat-store.service';
import { SearchService } from '../../../core/chat/search.service';
import { ExportImportService } from '../../../core/data/export-import.service';
import { downloadBlob } from '../../../core/filesystem/fs-support';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { SettingsService } from '../../../core/settings/settings.service';
import { DialogService } from '../../../core/ui/dialog.service';
import { ToastService } from '../../../core/ui/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { SwitchComponent } from '../../../shared/components/switch/switch.component';

@Component({
  selector: 'app-chat-settings',
  imports: [TPipe, SwitchComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.css',
  template: `
    <div class="section-head">
      <h2>{{ 'settings.nav.chat' | t }}</h2>
      <p>{{ 'settings.chat.desc' | t }}</p>
    </div>

    <div class="group">
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.temporaryDefault' | t }}</p>
          <p class="setting-desc" id="tmp-desc">{{ 'settings.temporaryDefaultDesc' | t }}</p>
        </div>
        <div class="control">
          <app-switch
            [checked]="s().temporaryByDefault"
            (checkedChange)="settings.update({ temporaryByDefault: $event })"
            [label]="'settings.temporaryDefault' | t"
            describedBy="tmp-desc"
          />
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <label class="setting-label" for="maxchars">{{ 'settings.maxMessageChars' | t }}</label>
          <p class="setting-desc">{{ 'settings.maxMessageCharsDesc' | t }}</p>
        </div>
        <div class="control">
          <input
            id="maxchars"
            class="input input-num"
            type="number"
            min="1000"
            step="1000"
            [value]="s().maxMessageChars"
            (change)="settings.update({ maxMessageChars: +$any($event.target).value })"
          />
        </div>
      </div>
    </div>

    <div class="group">
      <p class="group-title">{{ 'settings.history' | t }}</p>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.historyCount' | t: { n: count() } }}</p>
          <p class="setting-desc">{{ 'settings.historyDesc' | t }}</p>
        </div>
        <div class="control actions-row">
          <button type="button" class="btn btn-sm" (click)="exportChats()" [disabled]="count() === 0">
            <app-icon name="download" [size]="13" /> {{ 'settings.exportChats' | t }}
          </button>
          <button type="button" class="btn btn-sm btn-danger" (click)="clear()" [disabled]="count() === 0">
            <app-icon name="trash" [size]="13" /> {{ 'settings.clearHistory' | t }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ChatSettingsComponent {
  protected readonly settings = inject(SettingsService);
  private readonly store = inject(ChatStore);
  private readonly search = inject(SearchService);
  private readonly exporter = inject(ExportImportService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly s = this.settings.settings;
  protected readonly count = computed(() => this.store.history().length);

  protected async exportChats(): Promise<void> {
    const data = await this.exporter.buildExport();
    downloadBlob(
      JSON.stringify(data, null, 2),
      `conversaciones-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    );
  }

  protected async clear(): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('settings.clearHistoryTitle'),
      message: this.i18n.t('settings.clearHistoryMessage', { n: this.count() }),
      confirmLabel: this.i18n.t('settings.clearHistory'),
      danger: true,
    });
    if (!ok) return;
    await this.store.clearHistory();
    this.search.reset();
    this.toast.success(this.i18n.t('toast.historyCleared'));
  }
}
