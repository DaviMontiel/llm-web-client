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
import { RouterLink } from '@angular/router';
import { ChatStore } from '../../../core/chat/chat-store.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { ProviderConfigService } from '../../../core/llm/provider-config.service';
import { Chat } from '../../../core/models';
import { ProjectService } from '../../../core/projects/project.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { ComposerBridgeService } from '../../../core/ui/composer-bridge.service';
import { LayoutService } from '../../../core/ui/layout.service';
import { MenuItem, MenuService } from '../../../core/ui/menu.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { FileSizePipe, TokensPipe } from '../../../shared/pipes/format.pipes';
import { ProjectAccessComponent } from '../../projects/project-access.component';
import { ProjectExplorerComponent } from '../../projects/project-explorer.component';

/**
 * Panel lateral del chat: qué contexto se enviará (archivos del proyecto,
 * adjuntos e instrucciones) y explorador de archivos del proyecto.
 */
@Component({
  selector: 'app-context-panel',
  imports: [
    IconComponent,
    TPipe,
    FileSizePipe,
    TokensPipe,
    EmptyStateComponent,
    ProjectExplorerComponent,
    ProjectAccessComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './context-panel.component.html',
  styleUrl: './context-panel.component.css',
})
export class ContextPanelComponent {
  protected readonly store = inject(ChatStore);
  protected readonly projects = inject(ProjectService);
  protected readonly layout = inject(LayoutService);
  protected readonly bridge = inject(ComposerBridgeService);
  private readonly providers = inject(ProviderConfigService);
  private readonly settings = inject(SettingsService);
  private readonly menu = inject(MenuService);
  private readonly i18n = inject(I18nService);

  readonly chat = input.required<Chat>();
  readonly attachFromProject = output<string>();

  protected readonly tab = computed(() => (this.layout.rightPanel() === 'files' ? 'files' : 'context'));
  protected readonly project = computed(() => this.projects.get(this.chat().projectId));
  protected readonly files = computed(() => this.chat().context.files);
  protected readonly sizes = signal<Record<string, number | null>>({});

  protected readonly attachmentBytes = computed(() =>
    this.bridge
      .pending()
      .reduce((sum, p) => sum + (p.attachment?.kind === 'text' ? (p.attachment.textContent?.length ?? 0) : 0), 0),
  );
  protected readonly instructionsBytes = computed(() => {
    const p = this.project();
    return p && this.chat().context.includeInstructions ? p.instructions.trim().length : 0;
  });
  protected readonly filesBytes = computed(() => Object.values(this.sizes()).reduce<number>((s, v) => s + (v ?? 0), 0));
  protected readonly unknownSizes = computed(() =>
    this.files().some((f) => this.sizes()[f] === null || this.sizes()[f] === undefined),
  );
  protected readonly totalBytes = computed(() => this.filesBytes() + this.attachmentBytes() + this.instructionsBytes());
  protected readonly limitBytes = computed(() => this.settings.settings().maxContextKB * 1024);
  protected readonly usagePct = computed(() => Math.min(100, (this.totalBytes() / this.limitBytes()) * 100));
  protected readonly overLimit = computed(() => this.totalBytes() > this.limitBytes());

  protected readonly model = computed(
    () => this.providers.findModel(this.store.resolveModelRef(this.chat()))?.model ?? null,
  );
  /** Tokens reales informados por el proveedor en la última respuesta (no estimados). */
  protected readonly tokenInfo = computed(() => {
    const used = this.chat().lastUsage?.inputTokens;
    if (used === undefined) return null;
    const max = this.model()?.contextWindow;
    return { used, max: max ?? null, pct: max ? Math.min(100, (used / max) * 100) : null };
  });

  constructor() {
    effect(() => {
      const files = this.files();
      const project = this.project();
      untracked(() => {
        if (!project || files.length === 0) {
          this.sizes.set({});
          return;
        }
        void this.projects.statFiles(project.id, files).then((s) => this.sizes.set(s));
      });
    });
  }

  protected setTab(tab: 'context' | 'files'): void {
    this.layout.rightPanel.set(tab);
  }

  protected toggleInstructions(): void {
    const c = this.chat();
    this.store.setContext(c.id, { ...c.context, includeInstructions: !c.context.includeInstructions });
  }

  protected toggleFile(path: string): void {
    const c = this.chat();
    if (c.context.files.includes(path)) this.store.removeContextFile(c.id, path);
    else this.store.addContextFiles(c.id, [path]);
  }

  protected addFiles(paths: string[]): void {
    this.store.addContextFiles(this.chat().id, paths);
  }

  protected removeFile(path: string): void {
    this.store.removeContextFile(this.chat().id, path);
  }

  protected clearFiles(): void {
    const c = this.chat();
    this.store.setContext(c.id, { ...c.context, files: [] });
  }

  protected pickProject(event: MouseEvent): void {
    const chat = this.chat();
    const items: MenuItem[] = this.projects.sortedProjects().map((p) => ({
      id: p.id,
      label: p.name,
      icon: 'folder',
      checked: chat.projectId === p.id,
      run: () => this.store.setProject(chat.id, p.id),
    }));
    if (chat.projectId) {
      items.push({
        id: 'none',
        label: this.i18n.t('project.none'),
        icon: 'minus',
        separatorBefore: items.length > 0,
        run: () => this.store.setProject(chat.id, null),
      });
    }
    if (items.length === 0) {
      items.push({ id: 'empty', label: this.i18n.t('project.noProjects'), disabled: true });
    }
    this.menu.toggleAt(event.currentTarget as HTMLElement, items, this.i18n.t('project.select'), 'start');
  }
}
