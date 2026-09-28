import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChatStore } from '../../../core/chat/chat-store.service';
import { SearchService } from '../../../core/chat/search.service';
import { createDemoConversation } from '../../../core/data/demo-data';
import { ConflictStrategy, ExportImportService, ImportPlan } from '../../../core/data/export-import.service';
import { downloadBlob, pickFiles } from '../../../core/filesystem/fs-support';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { ProviderConfigService } from '../../../core/llm/provider-config.service';
import { StorageEstimateInfo, StorageService } from '../../../core/storage/storage.service';
import { DialogService } from '../../../core/ui/dialog.service';
import { ToastService } from '../../../core/ui/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../shared/components/modal/modal.component';
import { FileSizePipe } from '../../../shared/pipes/format.pipes';

const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

@Component({
  selector: 'app-data-settings',
  imports: [TPipe, IconComponent, ModalComponent, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.css',
  template: `
    <div class="section-head">
      <h2>{{ 'settings.nav.data' | t }}</h2>
      <p>{{ 'settings.data.desc' | t }}</p>
    </div>

    <div class="group">
      <p class="group-title">{{ 'settings.storage' | t }}</p>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">
            {{ storage.persistent() ? ('settings.storageIdb' | t) : ('settings.storageMemory' | t) }}
          </p>
          <p class="setting-desc">
            @if (estimate(); as e) {
              @if (e.usage !== null && e.quota !== null) {
                {{ 'settings.storageUsage' | t: { used: (e.usage | fileSize), quota: (e.quota | fileSize) } }}
              }
              @if (e.persisted === true) {
                · {{ 'settings.storagePersisted' | t }}
              }
            }
          </p>
        </div>
        <div class="control">
          @if (estimate()?.persisted === false) {
            <button type="button" class="btn btn-sm" (click)="persist()">{{ 'settings.requestPersist' | t }}</button>
          }
        </div>
      </div>
    </div>

    <div class="group">
      <p class="group-title">{{ 'settings.backup' | t }}</p>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.export' | t }}</p>
          <p class="setting-desc">{{ 'settings.exportDesc' | t }}</p>
        </div>
        <div class="control">
          <button type="button" class="btn btn-sm" (click)="exportAll()">
            <app-icon name="download" [size]="13" /> {{ 'settings.exportButton' | t }}
          </button>
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.import' | t }}</p>
          <p class="setting-desc">{{ 'settings.importDesc' | t }}</p>
        </div>
        <div class="control">
          <button type="button" class="btn btn-sm" (click)="pickImport()">
            <app-icon name="upload" [size]="13" /> {{ 'settings.importButton' | t }}
          </button>
        </div>
      </div>
    </div>

    <div class="group">
      <p class="group-title">{{ 'settings.demo' | t }}</p>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.demoLoad' | t }}</p>
          <p class="setting-desc">{{ 'settings.demoDesc' | t }}</p>
        </div>
        <div class="control">
          <button type="button" class="btn btn-sm" (click)="loadDemo()">{{ 'settings.demoButton' | t }}</button>
        </div>
      </div>
    </div>

    <div class="group">
      <p class="group-title">{{ 'project.dangerZone' | t }}</p>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.wipe' | t }}</p>
          <p class="setting-desc">{{ 'settings.wipeDesc' | t }}</p>
        </div>
        <div class="control">
          <button type="button" class="btn btn-sm btn-danger" (click)="wipe()">
            <app-icon name="trash" [size]="13" /> {{ 'settings.wipeButton' | t }}
          </button>
        </div>
      </div>
    </div>

    <app-modal [open]="!!plan()" [title]="'import.title' | t" size="sm" (closed)="plan.set(null)">
      @if (plan(); as p) {
        <ul class="summary">
          <li>{{ 'import.chats' | t: { n: p.newChats } }}</li>
          <li>{{ 'import.projects' | t: { n: p.newProjects } }}</li>
          <li>{{ 'import.messages' | t: { n: p.messages } }}</li>
          @if (p.invalidEntries > 0) {
            <li class="warn">{{ 'import.invalid' | t: { n: p.invalidEntries } }}</li>
          }
        </ul>
        @if (p.existingChats + p.existingProjects > 0) {
          <fieldset class="strategy">
            <legend>{{ 'import.conflicts' | t: { n: p.existingChats + p.existingProjects } }}</legend>
            @for (opt of strategies; track opt.value) {
              <label class="checkbox">
                <input
                  type="radio"
                  name="strategy"
                  [value]="opt.value"
                  [checked]="strategy() === opt.value"
                  (change)="strategy.set(opt.value)"
                />
                {{ opt.label | t }}
              </label>
            }
          </fieldset>
        }
        <label class="checkbox settings-opt">
          <input
            type="checkbox"
            [checked]="importSettings()"
            (change)="importSettings.set($any($event.target).checked)"
          />
          {{ 'import.settings' | t }}
        </label>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" (click)="plan.set(null)">{{ 'common.cancel' | t }}</button>
          <button type="button" class="btn btn-primary" (click)="applyImport()" [disabled]="importing()">
            {{ 'import.confirm' | t }}
          </button>
        </div>
      }
    </app-modal>
  `,
  styles: `
    .summary {
      margin: 0 0 14px;
      padding-left: 18px;
      font-size: 13.5px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .warn {
      color: var(--warning);
    }
    .strategy {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0 0 14px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }
    legend {
      padding: 0 4px;
      font-size: 12.5px;
      color: var(--muted);
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 18px;
    }
  `,
})
export class DataSettingsComponent implements OnInit {
  protected readonly storage = inject(StorageService);
  private readonly exporter = inject(ExportImportService);
  private readonly store = inject(ChatStore);
  private readonly providers = inject(ProviderConfigService);
  private readonly search = inject(SearchService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  protected readonly estimate = signal<StorageEstimateInfo | null>(null);
  protected readonly plan = signal<ImportPlan | null>(null);
  protected readonly strategy = signal<ConflictStrategy>('skip');
  protected readonly importSettings = signal(false);
  protected readonly importing = signal(false);
  protected readonly strategies = [
    { value: 'skip' as const, label: 'import.skip' as const },
    { value: 'duplicate' as const, label: 'import.duplicate' as const },
    { value: 'replace' as const, label: 'import.replace' as const },
  ];

  ngOnInit(): void {
    void this.storage.estimate().then((e) => this.estimate.set(e));
  }

  protected async persist(): Promise<void> {
    const ok = await this.storage.requestPersistence();
    this.toast.show(ok ? 'success' : 'info', this.i18n.t(ok ? 'settings.persistGranted' : 'settings.persistDenied'));
    this.estimate.set(await this.storage.estimate());
  }

  protected async exportAll(): Promise<void> {
    const data = await this.exporter.buildExport();
    downloadBlob(
      JSON.stringify(data, null, 2),
      `llm-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    );
    this.toast.success(this.i18n.t('toast.exported'));
  }

  protected async pickImport(): Promise<void> {
    const [file] = await pickFiles({ accept: 'application/json,.json', multiple: false });
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      this.toast.error(this.i18n.t('import.tooLarge'));
      return;
    }
    try {
      const plan = this.exporter.plan(await file.text());
      this.strategy.set('skip');
      this.importSettings.set(false);
      this.plan.set(plan);
    } catch (error) {
      const key =
        error instanceof Error && error.message === 'invalid-json' ? 'import.invalidJson' : 'import.invalidFormat';
      this.toast.error(this.i18n.t(key));
    }
  }

  protected async applyImport(): Promise<void> {
    const plan = this.plan();
    if (!plan) return;
    this.importing.set(true);
    try {
      const result = await this.exporter.apply(plan, {
        strategy: this.strategy(),
        importSettings: this.importSettings(),
      });
      this.toast.success(this.i18n.t('import.done', { chats: result.chats, projects: result.projects }));
      this.plan.set(null);
    } catch {
      this.toast.error(this.i18n.t('import.failed'));
    } finally {
      this.importing.set(false);
    }
  }

  protected async loadDemo(): Promise<void> {
    const { chat, messages } = createDemoConversation(this.i18n.t('settings.demoTitle'));
    await this.store.importChats([chat], messages);
    void this.router.navigate(['/chat', chat.id]);
  }

  protected async wipe(): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('settings.wipeTitle'),
      message: this.i18n.t('settings.wipeMessage'),
      confirmLabel: this.i18n.t('settings.wipeButton'),
      danger: true,
    });
    if (!ok) return;
    for (const c of this.store.chats()) this.store.stop(c.id);
    await this.storage.clearAll();
    await this.providers.clearAll();
    this.search.reset();
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* almacenamiento no disponible */
    }
    location.assign(document.baseURI);
  }
}
