import { NgTemplateOutlet } from '@angular/common';
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
import { copyText } from '../../core/filesystem/fs-support';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { AppError, ProjectTreeNode } from '../../core/models';
import { ProjectService } from '../../core/projects/project.service';
import { MenuItem, MenuService } from '../../core/ui/menu.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { FilePreviewDialogComponent } from './file-preview-dialog.component';
import { ProjectAccessComponent } from './project-access.component';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const MAX_FOLDER_FILES = 200;

/** Explorador de archivos del proyecto con carga perezosa, filtro y acciones. */
@Component({
  selector: 'app-project-explorer',
  imports: [
    IconComponent,
    TPipe,
    NgTemplateOutlet,
    EmptyStateComponent,
    ProjectAccessComponent,
    FilePreviewDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-explorer.component.html',
  styleUrl: './project-explorer.component.css',
})
export class ProjectExplorerComponent {
  private readonly projects = inject(ProjectService);
  private readonly menu = inject(MenuService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly projectId = input.required<string>();
  /** Rutas actualmente incluidas en el contexto del chat. */
  readonly contextFiles = input<readonly string[]>([]);
  /** Muestra acciones de chat (añadir al contexto / adjuntar). */
  readonly chatActions = input(true);

  readonly toggleContext = output<string>();
  readonly addToContext = output<string[]>();
  readonly attach = output<string>();

  protected readonly children = signal<Record<string, ProjectTreeNode[]>>({});
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly loadingDirs = signal<ReadonlySet<string>>(new Set());
  protected readonly status = signal<LoadStatus>('idle');
  protected readonly errorMessage = signal('');
  protected readonly filter = signal('');
  protected readonly allFiles = signal<string[] | null>(null);
  protected readonly allFilesTruncated = signal(false);
  protected readonly previewPath = signal<string | null>(null);

  protected readonly project = computed(() => this.projects.get(this.projectId()));
  protected readonly access = computed(() => this.projects.accessOf(this.projectId()));
  protected readonly readable = computed(() => {
    const a = this.access();
    return a === 'granted' || a === 'snapshot' || a === 'unavailable';
  });
  protected readonly contextSet = computed(() => new Set(this.contextFiles()));
  protected readonly filtered = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const all = this.allFiles();
    if (!q || !all) return [];
    return all.filter((p) => p.toLowerCase().includes(q)).slice(0, 300);
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      const readable = this.readable();
      untracked(() => {
        this.children.set({});
        this.expanded.set(new Set());
        this.allFiles.set(null);
        this.filter.set('');
        if (readable && id) void this.loadDir('');
        else this.status.set('idle');
      });
    });
  }

  protected async loadDir(path: string): Promise<void> {
    if (path === '') this.status.set('loading');
    this.loadingDirs.update((s) => new Set(s).add(path));
    try {
      const nodes = await this.projects.listChildren(this.projectId(), path);
      this.children.update((c) => ({ ...c, [path]: nodes }));
      if (path === '') this.status.set('ready');
    } catch (error) {
      if (path === '') {
        this.status.set('error');
        this.errorMessage.set(this.describeError(error));
      } else {
        this.toast.error(this.describeError(error));
      }
    } finally {
      this.loadingDirs.update((s) => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    }
  }

  protected reload(): void {
    this.children.set({});
    this.allFiles.set(null);
    const open = [...this.expanded()];
    void this.loadDir('').then(() => Promise.all(open.map((p) => this.loadDir(p))));
  }

  protected toggleDir(node: ProjectTreeNode): void {
    const open = this.expanded().has(node.path);
    this.expanded.update((s) => {
      const next = new Set(s);
      if (open) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
    if (!open && !this.children()[node.path]) void this.loadDir(node.path);
  }

  protected async onFilter(value: string): Promise<void> {
    this.filter.set(value);
    if (value.trim() && this.allFiles() === null) {
      try {
        const { paths, truncated } = await this.projects.listAllFiles(this.projectId());
        this.allFiles.set(paths);
        this.allFilesTruncated.set(truncated);
      } catch (error) {
        this.toast.error(this.describeError(error));
        this.allFiles.set([]);
      }
    }
  }

  protected openFile(path: string): void {
    this.previewPath.set(path);
  }

  protected fileMenu(event: MouseEvent, path: string, pointer: boolean): void {
    const items: MenuItem[] = [
      { id: 'open', label: this.i18n.t('explorer.open'), icon: 'eye', run: () => this.openFile(path) },
    ];
    if (this.chatActions()) {
      items.push(
        {
          id: 'context',
          label: this.contextSet().has(path)
            ? this.i18n.t('explorer.removeFromContext')
            : this.i18n.t('explorer.addToContext'),
          icon: 'layers',
          run: () => this.toggleContext.emit(path),
        },
        { id: 'attach', label: this.i18n.t('explorer.attach'), icon: 'paperclip', run: () => this.attach.emit(path) },
      );
    }
    items.push({
      id: 'copy',
      label: this.i18n.t('explorer.copyPath'),
      icon: 'copy',
      run: () => void this.copyPath(path),
    });
    if (pointer) this.menu.openAtPointer(event, items, path);
    else this.menu.toggleAt(event.currentTarget as HTMLElement, items, path);
  }

  protected dirMenu(event: MouseEvent, node: ProjectTreeNode): void {
    const items: MenuItem[] = [];
    if (this.chatActions()) {
      items.push({
        id: 'ctx',
        label: this.i18n.t('explorer.addFolderToContext'),
        icon: 'layers',
        run: () => void this.addFolder(node.path),
      });
    }
    items.push({
      id: 'copy',
      label: this.i18n.t('explorer.copyPath'),
      icon: 'copy',
      run: () => void this.copyPath(node.path),
    });
    this.menu.openAtPointer(event, items, node.path);
  }

  private async addFolder(path: string): Promise<void> {
    try {
      let all = this.allFiles();
      if (!all) {
        const res = await this.projects.listAllFiles(this.projectId());
        all = res.paths;
        this.allFiles.set(all);
      }
      const files = all.filter((p) => p.startsWith(`${path}/`));
      if (files.length > MAX_FOLDER_FILES) {
        this.toast.warning(this.i18n.t('explorer.folderTooBig', { n: files.length, max: MAX_FOLDER_FILES }));
        return;
      }
      this.addToContext.emit(files);
      this.toast.success(this.i18n.t('explorer.folderAdded', { n: files.length }));
    } catch (error) {
      this.toast.error(this.describeError(error));
    }
  }

  protected async copyPath(path: string): Promise<void> {
    const root = this.project()?.rootName;
    const ok = await copyText(root ? `${root}/${path}` : path);
    if (ok) this.toast.success(this.i18n.t('toast.pathCopied'));
  }

  private describeError(error: unknown): string {
    if (error instanceof AppError) {
      if (error.code === 'permission') return this.i18n.t('error.permission');
      if (error.code === 'not_found') return this.i18n.t('error.fsNotFound');
    }
    return this.i18n.t('error.fsRead');
  }
}
