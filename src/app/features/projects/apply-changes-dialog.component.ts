import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { AppError } from '../../core/models';
import { ProjectService } from '../../core/projects/project.service';
import { CodeActionsService } from '../../core/ui/code-actions.service';
import { ToastService } from '../../core/ui/toast.service';
import { normalizeRelativePath } from '../../core/utils/file-name';
import { DiffLine, diffLines, diffStats } from '../../core/utils/line-diff';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * "El modelo propone modificar X": muestra el diff contra el archivo actual
 * y solo escribe tras confirmación explícita (pide permiso readwrite).
 */
@Component({
  selector: 'app-apply-changes-dialog',
  imports: [ModalComponent, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let req = actions.applyRequest();
    <app-modal
      [open]="!!req"
      [title]="'apply.title' | t"
      [subtitle]="'apply.subtitle' | t"
      size="lg"
      [closeOnBackdrop]="false"
      (closed)="actions.close()"
    >
      @if (req) {
        <div class="path-row">
          <label class="field grow">
            <span class="field-label">{{ 'apply.path' | t }}</span>
            <input
              class="input mono"
              [value]="path()"
              (input)="setPath($any($event.target).value)"
              [class.is-invalid]="!!path() && !validPath()"
              placeholder="src/app/app.ts"
            />
          </label>
          <button type="button" class="btn" (click)="load()" [disabled]="!validPath() || state() === 'loading'">
            <app-icon name="refresh-cw" [size]="14" /> {{ 'apply.compare' | t }}
          </button>
        </div>
        @if (state() === 'loading') {
          <div class="skeleton sk"></div>
        } @else if (state() === 'error') {
          <div class="notice notice-danger">
            <app-icon name="circle-alert" [size]="15" /><span>{{ error() }}</span>
          </div>
        } @else if (state() === 'ready') {
          <div class="summary">
            @if (isNew()) {
              <span class="badge badge-accent">{{ 'apply.newFile' | t }}</span>
            } @else if (stats().added === 0 && stats().removed === 0) {
              <span class="badge">{{ 'apply.noChanges' | t }}</span>
            }
            <span class="add">+{{ stats().added }}</span>
            <span class="rem">−{{ stats().removed }}</span>
          </div>
          <div class="diff" role="region" [attr.aria-label]="'apply.diff' | t" tabindex="0">
            @for (l of visibleLines(); track $index) {
              <div class="line" [class]="'t-' + l.type">
                <span class="n">{{ l.oldNumber ?? '' }}</span
                ><span class="n">{{ l.newNumber ?? '' }}</span
                ><span class="sign">{{ l.type === 'add' ? '+' : l.type === 'remove' ? '−' : ' ' }}</span
                ><span class="txt">{{ l.text }}</span>
              </div>
            }
            @if (hiddenCount() > 0) {
              <div class="more">{{ 'apply.truncated' | t: { n: hiddenCount() } }}</div>
            }
          </div>
        }
        <div class="notice notice-warning safety">
          <app-icon name="shield-alert" [size]="15" />
          <span>{{ 'apply.warning' | t }}</span>
        </div>
      }
      <div modal-footer class="footer">
        <button type="button" class="btn btn-ghost" (click)="actions.close()">{{ 'common.cancel' | t }}</button>
        <button
          type="button"
          class="btn btn-primary"
          (click)="apply()"
          [disabled]="state() !== 'ready' || writing() || (!isNew() && stats().added === 0 && stats().removed === 0)"
        >
          @if (writing()) {
            <app-icon name="loader-circle" [size]="14" class="spin" />
          }
          {{ 'apply.confirm' | t }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .path-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      margin-bottom: 12px;
    }
    .grow {
      flex: 1;
    }
    .sk {
      height: 160px;
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      font-size: 12.5px;
      font-family: var(--font-mono);
    }
    .add {
      color: var(--diff-add-fg);
    }
    .rem {
      color: var(--diff-remove-fg);
    }
    .diff {
      max-height: 48vh;
      overflow: auto;
      border: 1px solid var(--code-border);
      border-radius: var(--radius-md);
      background: var(--code-bg);
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.55;
      padding: 6px 0;
    }
    .line {
      display: flex;
      min-width: max-content;
      white-space: pre;
    }
    .n {
      width: 42px;
      padding-right: 8px;
      text-align: right;
      color: var(--subtle);
      user-select: none;
      flex-shrink: 0;
    }
    .sign {
      width: 18px;
      text-align: center;
      user-select: none;
      flex-shrink: 0;
    }
    .txt {
      padding-right: 14px;
    }
    .t-add {
      background: var(--diff-add-bg);
      color: var(--diff-add-fg);
    }
    .t-remove {
      background: var(--diff-remove-bg);
      color: var(--diff-remove-fg);
    }
    .more {
      padding: 6px 14px;
      color: var(--muted);
      font-family: var(--font-sans);
    }
    .safety {
      margin-top: 12px;
    }
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 20px 16px;
      border-top: 1px solid var(--border);
    }
  `,
})
export class ApplyChangesDialogComponent {
  protected readonly actions = inject(CodeActionsService);
  private readonly projects = inject(ProjectService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly path = signal('');
  protected readonly state = signal<LoadState>('idle');
  protected readonly error = signal('');
  protected readonly writing = signal(false);
  private readonly current = signal<string | null>(null);
  protected readonly isNew = computed(() => this.current() === null);
  protected readonly validPath = computed(() => normalizeRelativePath(this.path()) !== null);

  private readonly lines = computed<DiffLine[]>(() => {
    const req = this.actions.applyRequest();
    if (!req || this.state() !== 'ready') return [];
    return diffLines(this.current() ?? '', req.content);
  });
  protected readonly stats = computed(() => diffStats(this.lines()));
  protected readonly visibleLines = computed(() => this.lines().slice(0, 3000));
  protected readonly hiddenCount = computed(() => Math.max(0, this.lines().length - 3000));

  constructor() {
    effect(() => {
      const req = this.actions.applyRequest();
      untracked(() => {
        this.writing.set(false);
        this.current.set(null);
        this.path.set(req?.path ?? '');
        this.state.set('idle');
        if (req?.path) void this.load();
      });
    });
  }

  protected setPath(value: string): void {
    this.path.set(value);
    this.state.set('idle');
  }

  protected async load(): Promise<void> {
    const req = this.actions.applyRequest();
    const path = normalizeRelativePath(this.path());
    if (!req || !path) return;
    this.state.set('loading');
    try {
      if (!this.projects.canRead(req.projectId)) {
        const granted = await this.projects.grantAccess(req.projectId);
        if (granted !== 'granted') throw new AppError('permission', this.i18n.t('error.permission'));
      }
      this.current.set(await this.projects.readForDiff(req.projectId, path));
      this.state.set('ready');
    } catch (e) {
      this.error.set(
        e instanceof AppError && e.code === 'permission'
          ? this.i18n.t('error.permission')
          : this.i18n.t('error.fileRead', { name: path }),
      );
      this.state.set('error');
    }
  }

  protected async apply(): Promise<void> {
    const req = this.actions.applyRequest();
    const path = normalizeRelativePath(this.path());
    if (!req || !path || this.writing()) return;
    this.writing.set(true);
    try {
      await this.projects.writeFile(req.projectId, path, req.content);
      this.toast.success(this.i18n.t('toast.fileWritten', { path }));
      this.actions.close();
    } catch (e) {
      this.toast.error(
        e instanceof AppError && e.code === 'permission'
          ? this.i18n.t('error.writePermission')
          : this.i18n.t('error.fileWrite', { path }),
      );
    } finally {
      this.writing.set(false);
    }
  }
}
