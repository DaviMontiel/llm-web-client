import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatStore } from '../../core/chat/chat-store.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { ModelRef, Project } from '../../core/models';
import { ProjectService } from '../../core/projects/project.service';
import { DialogService } from '../../core/ui/dialog.service';
import { LayoutService } from '../../core/ui/layout.service';
import { ToastService } from '../../core/ui/toast.service';
import { parsePatternList } from '../../core/utils/glob';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ShortDatePipe } from '../../shared/pipes/format.pipes';
import { ModelPickerComponent } from '../chat/model-picker/model-picker.component';
import { ProjectAccessComponent } from './project-access.component';
import { ProjectExplorerComponent } from './project-explorer.component';

type EditableField = 'name' | 'description' | 'instructions' | 'ignore';

@Component({
  selector: 'app-project-detail-page',
  imports: [
    IconComponent,
    TPipe,
    RouterLink,
    EmptyStateComponent,
    ProjectAccessComponent,
    ProjectExplorerComponent,
    ModelPickerComponent,
    ShortDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-detail-page.component.html',
  styleUrl: './page.css',
})
export class ProjectDetailPageComponent {
  private readonly projects = inject(ProjectService);
  private readonly store = inject(ChatStore);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  protected readonly layout = inject(LayoutService);

  readonly id = input.required<string>();

  private readonly access = viewChild(ProjectAccessComponent);
  protected readonly project = computed(() => this.projects.get(this.id()));
  protected readonly accessState = computed(() => this.projects.accessOf(this.id()));
  protected readonly stateKey = computed(() => {
    switch (this.accessState()) {
      case 'granted':
        return 'project.state.granted' as const;
      case 'snapshot':
        return 'project.source.snapshot' as const;
      case 'prompt':
        return 'project.state.prompt' as const;
      case 'missing':
        return 'project.state.missing' as const;
      default:
        return 'project.state.other' as const;
    }
  });
  protected readonly saveState = signal<'idle' | 'saving' | 'saved'>('idle');

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly instructions = signal('');
  protected readonly ignore = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const p = this.project();
      untracked(() => {
        if (!p) return;
        this.name.set(p.name);
        this.description.set(p.description);
        this.instructions.set(p.instructions);
        this.ignore.set(p.ignorePatterns.join('\n'));
      });
    });
    inject(DestroyRef).onDestroy(() => this.flush());
  }

  protected edit(field: EditableField, value: string): void {
    ({ name: this.name, description: this.description, instructions: this.instructions, ignore: this.ignore })[
      field
    ].set(value);
    this.saveState.set('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }

  private flush(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    const p = this.project();
    if (!p) return;
    const patch: Partial<Project> = {
      name: this.name().trim() || p.name,
      description: this.description(),
      instructions: this.instructions(),
      ignorePatterns: parsePatternList(this.ignore()),
    };
    void this.projects.update(p.id, patch).then(() => this.saveState.set('saved'));
  }

  protected setDefaultModel(ref: ModelRef): void {
    void this.projects.update(this.id(), { defaultModel: ref });
  }

  protected clearDefaultModel(): void {
    void this.projects.update(this.id(), { defaultModel: null });
  }

  protected connect(): void {
    void this.access()?.connect();
  }

  protected async disconnect(): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('project.disconnectTitle'),
      message: this.i18n.t('project.disconnectMessage'),
      confirmLabel: this.i18n.t('project.disconnect'),
    });
    if (ok) await this.projects.disconnectDirectory(this.id());
  }

  protected newChat(): void {
    void this.router.navigate(['/'], { queryParams: { project: this.id(), new: Date.now() } });
  }

  protected async remove(): Promise<void> {
    const p = this.project();
    if (!p) return;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('project.deleteTitle'),
      message: this.i18n.t('project.deleteMessage', { name: p.name }),
      confirmLabel: this.i18n.t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    this.timer = null;
    await this.projects.remove(p.id);
    this.store.detachProject(p.id);
    this.toast.success(this.i18n.t('toast.projectDeleted'));
    void this.router.navigate(['/projects']);
  }
}
