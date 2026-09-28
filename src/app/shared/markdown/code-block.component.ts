import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { copyText, downloadBlob } from '../../core/filesystem/fs-support';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { ProjectService } from '../../core/projects/project.service';
import { CodeActionsService } from '../../core/ui/code-actions.service';
import { MenuService } from '../../core/ui/menu.service';
import { ToastService } from '../../core/ui/toast.service';
import { sanitizeFileName } from '../../core/utils/file-name';
import { IconComponent } from '../components/icon/icon.component';
import { detectCodePath } from './code-path';
import { highlightCode, languageLabel, resolveLanguage } from './highlight';

const EXTENSIONS: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  xml: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  python: 'py',
  bash: 'sh',
  shell: 'sh',
  dart: 'dart',
  java: 'java',
  kotlin: 'kt',
  go: 'go',
  rust: 'rs',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  sql: 'sql',
  yaml: 'yaml',
  markdown: 'md',
  diff: 'diff',
  php: 'php',
  ruby: 'rb',
  swift: 'swift',
  dockerfile: 'Dockerfile',
  ini: 'ini',
  graphql: 'graphql',
  powershell: 'ps1',
};

const COLLAPSE_LINES = 40;

interface DiffRow {
  type: 'add' | 'remove' | 'hunk' | 'meta' | 'context';
  text: string;
}

/** Bloque de código con resaltado, copiar, guardar como archivo y aplicar a archivo del proyecto. */
@Component({
  selector: 'app-code-block',
  imports: [IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="code" [class.is-diff]="isDiff()">
      <div class="bar">
        <span class="lang">
          {{ label() }}
          @if (path()) {
            <span class="path" [title]="path()">{{ path() }}</span>
          }
        </span>
        <div class="actions">
          @if (!closed()) {
            <span class="writing"
              ><app-icon name="loader-circle" [size]="12" class="spin" /> {{ 'code.writing' | t }}</span
            >
          } @else {
            @if (canApply()) {
              <button type="button" class="act" (click)="apply()" [title]="'code.applyHint' | t">
                <app-icon name="file-diff" [size]="13" /> <span>{{ 'code.apply' | t }}</span>
              </button>
            }
            <button type="button" class="act" (click)="save()" [title]="'code.saveAs' | t">
              <app-icon name="download" [size]="13" /> <span class="hide-sm">{{ 'code.save' | t }}</span>
            </button>
            <button type="button" class="act" (click)="copy()" [attr.aria-label]="'code.copy' | t">
              <app-icon [name]="copied() ? 'check' : 'copy'" [size]="13" />
              <span>{{ copied() ? ('code.copied' | t) : ('code.copy' | t) }}</span>
            </button>
          }
        </div>
      </div>
      <div class="body" [class.collapsed]="collapsible() && !expanded()">
        @if (isDiff()) {
          <pre
            class="diff"
            tabindex="0"
          ><code>@for (row of diffRows(); track $index) {<span class="row" [class]="'r-' + row.type">{{ row.text }}</span>
}</code></pre>
        } @else if (closed()) {
          <pre tabindex="0"><code class="hljs" [innerHTML]="highlighted()"></code></pre>
        } @else {
          <pre tabindex="0"><code class="hljs">{{ code() }}<span class="stream-caret"></span></code></pre>
        }
      </div>
      @if (collapsible()) {
        <button type="button" class="expand" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()">
          <app-icon [name]="expanded() ? 'chevron-down' : 'chevron-right'" [size]="13" />
          {{ expanded() ? ('code.collapse' | t) : ('code.expand' | t: { n: lineCount() }) }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin: 0 0 14px;
    }
    .code {
      border: 1px solid var(--code-border);
      border-radius: var(--radius-md);
      background: var(--code-bg);
      overflow: hidden;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      height: 34px;
      padding: 0 6px 0 12px;
      background: var(--code-header);
      border-bottom: 1px solid var(--code-border);
      font-size: 12px;
      color: var(--muted);
    }
    .lang {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-weight: 500;
    }
    .path {
      font-family: var(--font-mono);
      font-weight: 400;
      color: var(--subtle);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .act {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 24px;
      padding: 0 7px;
      border: none;
      border-radius: 6px;
      background: none;
      color: var(--muted);
      font-size: 12px;
      transition:
        background var(--dur-fast),
        color var(--dur-fast);
    }
    .act:hover {
      background: var(--surface-hover);
      color: var(--foreground);
    }
    .writing {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding-right: 6px;
    }
    .body {
      position: relative;
    }
    .body.collapsed {
      max-height: 420px;
      overflow: hidden;
    }
    .body.collapsed::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 56px;
      background: linear-gradient(transparent, var(--code-bg));
      pointer-events: none;
    }
    pre {
      margin: 0;
      padding: 12px 14px;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      tab-size: 2;
    }
    pre:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }
    code {
      font-family: inherit;
      background: none;
      padding: 0;
      font-size: inherit;
    }
    .diff {
      padding: 8px 0;
    }
    .row {
      display: inline-block;
      min-width: 100%;
      padding: 0 14px;
    }
    .r-add {
      background: var(--diff-add-bg);
      color: var(--diff-add-fg);
    }
    .r-remove {
      background: var(--diff-remove-bg);
      color: var(--diff-remove-fg);
    }
    .r-hunk {
      color: var(--syn-type);
    }
    .r-meta {
      color: var(--muted);
      font-weight: 600;
    }
    .expand {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      height: 30px;
      padding: 0 12px;
      border: none;
      border-top: 1px solid var(--code-border);
      background: var(--code-header);
      color: var(--muted);
      font-size: 12px;
    }
    .expand:hover {
      color: var(--foreground);
    }
    @media (max-width: 640px) {
      .hide-sm {
        display: none;
      }
    }
  `,
})
export class CodeBlockComponent {
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly projects = inject(ProjectService);
  private readonly codeActions = inject(CodeActionsService);
  private readonly menu = inject(MenuService);

  readonly code = input.required<string>();
  readonly lang = input('');
  readonly closed = input(true);

  protected readonly copied = signal(false);
  protected readonly expanded = signal(false);

  protected readonly resolved = computed(() => resolveLanguage(this.lang()));
  protected readonly label = computed(() => languageLabel(this.lang(), this.i18n.t('code.label')));
  protected readonly isDiff = computed(() => this.resolved() === 'diff');
  protected readonly highlighted = computed(() => highlightCode(this.code(), this.lang()).html);
  protected readonly lineCount = computed(() => this.code().split('\n').length);
  protected readonly collapsible = computed(() => this.closed() && this.lineCount() > COLLAPSE_LINES);
  protected readonly path = computed(() => detectCodePath(this.lang(), this.code()));
  protected readonly canApply = computed(() => {
    const projectId = this.codeActions.activeProjectId();
    return !!projectId && !this.isDiff() && this.projects.canWrite(projectId);
  });

  protected readonly diffRows = computed<DiffRow[]>(() =>
    this.code()
      .split('\n')
      .map((text) => {
        if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('diff ') || text.startsWith('index ')) {
          return { type: 'meta' as const, text };
        }
        if (text.startsWith('@@')) return { type: 'hunk' as const, text };
        if (text.startsWith('+')) return { type: 'add' as const, text };
        if (text.startsWith('-')) return { type: 'remove' as const, text };
        return { type: 'context' as const, text };
      }),
  );

  protected async copy(): Promise<void> {
    const ok = await copyText(this.code());
    if (ok) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    } else {
      this.toast.error(this.i18n.t('toast.copyFailed'));
    }
  }

  protected save(): void {
    const suggested = this.path()?.split('/').pop();
    const ext = EXTENSIONS[this.resolved() ?? ''] ?? 'txt';
    const name = sanitizeFileName(suggested ?? (ext === 'Dockerfile' ? 'Dockerfile' : `snippet.${ext}`));
    downloadBlob(this.code(), name);
  }

  protected apply(): void {
    const projectId = this.codeActions.activeProjectId();
    if (!projectId) return;
    this.menu.close(false);
    this.codeActions.requestApply({
      projectId,
      path: this.path() ?? '',
      content: this.code().replace(/\n$/, '') + '\n',
    });
  }
}
