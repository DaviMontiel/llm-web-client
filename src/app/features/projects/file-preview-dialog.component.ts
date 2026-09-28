import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { arrayBufferToBase64 } from '../../core/filesystem/attachment.service';
import { copyText } from '../../core/filesystem/fs-support';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { ProjectFileContent } from '../../core/models';
import { ProjectService } from '../../core/projects/project.service';
import { ToastService } from '../../core/ui/toast.service';
import { fileExtension } from '../../core/utils/format';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { highlightCode } from '../../shared/markdown/highlight';
import { FileSizePipe } from '../../shared/pipes/format.pipes';

const PREVIEW_MAX_BYTES = 512 * 1024;
const IMAGE_PREVIEW_MAX = 10 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Previsualización de un archivo del proyecto (solo lectura). */
@Component({
  selector: 'app-file-preview-dialog',
  imports: [ModalComponent, IconComponent, TPipe, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="!!path()" [title]="fileName()" [subtitle]="path() ?? ''" size="xl" (closed)="closed.emit()">
      @switch (status()) {
        @case ('loading') {
          <div class="skeleton sk"></div>
        }
        @case ('error') {
          <div class="notice notice-danger">
            <app-icon name="circle-alert" [size]="15" /><span>{{ 'error.fsRead' | t }}</span>
          </div>
        }
        @case ('ready') {
          @if (content(); as c) {
            @if (imageUrl(); as src) {
              <div class="image"><img [src]="src" [alt]="fileName()" /></div>
              <p class="meta">{{ c.size | fileSize }}</p>
            } @else if (c.binary) {
              <div class="notice">
                <app-icon name="file" [size]="15" />
                <span>{{ 'preview.binary' | t: { size: (c.size | fileSize) } }}</span>
              </div>
            } @else {
              @if (c.truncated) {
                <p class="trunc">{{ 'preview.truncated' | t }}</p>
              }
              <pre class="code" tabindex="0"><code class="hljs" [innerHTML]="highlighted()"></code></pre>
              <p class="meta">{{ c.size | fileSize }} · {{ lineCount() }} {{ 'preview.lines' | t }}</p>
            }
          }
        }
      }
      <div modal-footer class="footer">
        <button type="button" class="btn btn-ghost" (click)="copyPath()">
          <app-icon name="copy" [size]="14" /> {{ 'explorer.copyPath' | t }}
        </button>
        @if (chatActions()) {
          <button
            type="button"
            class="btn"
            (click)="attach.emit(path()!); closed.emit()"
            [disabled]="status() !== 'ready'"
          >
            <app-icon name="paperclip" [size]="14" /> {{ 'explorer.attach' | t }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            (click)="toggleContext.emit(path()!)"
            [disabled]="status() !== 'ready' || !!content()?.binary"
          >
            <app-icon [name]="inContext() ? 'check' : 'layers'" [size]="14" />
            {{ inContext() ? ('explorer.inContext' | t) : ('explorer.addToContext' | t) }}
          </button>
        }
      </div>
    </app-modal>
  `,
  styles: `
    .sk {
      height: 280px;
    }
    .image {
      display: grid;
      place-items: center;
      max-height: 58vh;
      overflow: auto;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-2);
    }
    .image img {
      max-width: 100%;
      max-height: 54vh;
      object-fit: contain;
    }
    .code {
      margin: 0;
      max-height: 58vh;
      overflow: auto;
      padding: 12px 14px;
      border: 1px solid var(--code-border);
      border-radius: var(--radius-md);
      background: var(--code-bg);
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.6;
    }
    .trunc,
    .meta {
      font-size: 12px;
      color: var(--muted);
      margin: 6px 0;
    }
    .footer {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 20px 16px;
      border-top: 1px solid var(--border);
    }
  `,
})
export class FilePreviewDialogComponent {
  private readonly projects = inject(ProjectService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly projectId = input.required<string>();
  readonly path = input<string | null>(null);
  readonly inContext = input(false);
  readonly chatActions = input(true);
  readonly closed = output<void>();
  readonly toggleContext = output<string>();
  readonly attach = output<string>();

  protected readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly content = signal<ProjectFileContent | null>(null);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly fileName = computed(() => this.path()?.split('/').pop() ?? '');
  protected readonly highlighted = computed(() => {
    const c = this.content();
    return c?.text !== undefined ? highlightCode(c.text, fileExtension(c.path) || null).html : '';
  });
  protected readonly lineCount = computed(() => this.content()?.text?.split('\n').length ?? 0);

  constructor() {
    effect(() => {
      const path = this.path();
      const id = this.projectId();
      untracked(() => {
        if (!path) {
          this.content.set(null);
          this.status.set('idle');
          return;
        }
        this.status.set('loading');
        this.imageUrl.set(null);
        const mime = IMAGE_TYPES[fileExtension(path)];
        if (mime) void this.loadImage(id, path, mime);
        this.projects
          .readFile(id, path, PREVIEW_MAX_BYTES)
          .then((c) => {
            if (this.path() !== path) return;
            this.content.set(c);
            this.status.set('ready');
          })
          .catch(() => this.status.set('error'));
      });
    });
  }

  /** Las imágenes se muestran como data URL (Angular bloquea `blob:` por seguridad). */
  private async loadImage(id: string, path: string, mime: string): Promise<void> {
    try {
      const file = await this.projects.readAsFile(id, path);
      if (file.size > IMAGE_PREVIEW_MAX || this.path() !== path) return;
      this.imageUrl.set(`data:${mime};base64,${arrayBufferToBase64(await file.arrayBuffer())}`);
    } catch {
      /* se muestra la información de archivo binario */
    }
  }

  protected async copyPath(): Promise<void> {
    const root = this.projects.get(this.projectId())?.rootName;
    const p = this.path() ?? '';
    if (await copyText(root ? `${root}/${p}` : p)) this.toast.success(this.i18n.t('toast.pathCopied'));
  }
}
