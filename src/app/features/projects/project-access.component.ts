import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { browserSupport, pickFiles } from '../../core/filesystem/fs-support';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { AppError } from '../../core/models';
import { ProjectService } from '../../core/projects/project.service';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Controles para conectar/reconectar la carpeta de un proyecto y conceder
 * permisos, con fallback de subida de carpeta si no hay File System Access API.
 */
@Component({
  selector: 'app-project-access',
  imports: [IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let state = access();
    @switch (state) {
      @case ('prompt') {
        <div class="notice">
          <app-icon name="lock" [size]="15" />
          <div class="grow">
            <p>{{ 'project.access.prompt' | t }}</p>
            <button type="button" class="btn btn-sm btn-primary" (click)="grant()">
              {{ 'project.access.grant' | t }}
            </button>
          </div>
        </div>
      }
      @case ('denied') {
        <div class="notice notice-danger">
          <app-icon name="lock" [size]="15" />
          <div class="grow">
            <p>{{ 'project.access.denied' | t }}</p>
            <button type="button" class="btn btn-sm" (click)="connect()">{{ 'project.selectFolder' | t }}</button>
          </div>
        </div>
      }
      @case ('missing') {
        <div class="notice notice-warning">
          <app-icon name="unplug" [size]="15" />
          <div class="grow">
            <p>{{ 'project.access.missing' | t }}</p>
            <button type="button" class="btn btn-sm" (click)="connect()">{{ 'project.reselectFolder' | t }}</button>
          </div>
        </div>
      }
      @case ('none') {
        <div class="notice">
          <app-icon name="folder" [size]="15" />
          <div class="grow">
            <p>{{ 'project.access.none' | t }}</p>
            <div class="row">
              <button type="button" class="btn btn-sm btn-primary" (click)="connect()">
                {{ 'project.selectFolder' | t }}
              </button>
            </div>
            @if (!supportsPicker) {
              <p class="hint">{{ 'fs.noDirectoryAccess' | t }}</p>
            }
          </div>
        </div>
      }
      @case ('snapshot') {
        @if (showSnapshotInfo()) {
          <div class="notice">
            <app-icon name="hard-drive" [size]="15" />
            <div class="grow">
              <p>{{ 'project.access.snapshot' | t }}</p>
              <button type="button" class="btn btn-sm" (click)="connect()">
                {{ supportsPicker ? ('project.selectFolder' | t) : ('project.refreshSnapshot' | t) }}
              </button>
            </div>
          </div>
        }
      }
    }
  `,
  styles: `
    .notice p {
      margin-bottom: 8px;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .hint {
      margin: 8px 0 0 !important;
      font-size: 12px;
    }
  `,
})
export class ProjectAccessComponent {
  private readonly projects = inject(ProjectService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly projectId = input.required<string>();
  readonly showSnapshotInfo = input(true);

  protected readonly supportsPicker = browserSupport.directoryPicker();
  protected readonly access = computed(() => this.projects.accessOf(this.projectId()));

  protected async grant(): Promise<void> {
    const state = await this.projects.grantAccess(this.projectId());
    if (state !== 'granted') this.toast.error(this.i18n.t('error.permission'));
  }

  async connect(): Promise<void> {
    const id = this.projectId();
    try {
      if (this.supportsPicker) {
        const ok = await this.projects.connectDirectory(id);
        if (ok) this.toast.success(this.i18n.t('toast.folderConnected'));
        return;
      }
      const files = await pickFiles({ directory: true });
      if (!files.length) return;
      const result = await this.projects.importSnapshot(id, files);
      this.toast.success(this.i18n.t('toast.snapshotImported', { n: result.imported }), {
        detail: result.truncated ? this.i18n.t('project.snapshotTruncated') : undefined,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'unsupported')
        this.toast.error(this.i18n.t('fs.noDirectoryAccess'));
      else this.toast.error(this.i18n.t('error.folderSelect'));
    }
  }
}
