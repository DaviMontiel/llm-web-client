import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatStore } from '../../core/chat/chat-store.service';
import { browserSupport } from '../../core/filesystem/fs-support';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { Project } from '../../core/models';
import { ProjectService } from '../../core/projects/project.service';
import { DialogService } from '../../core/ui/dialog.service';
import { LayoutService } from '../../core/ui/layout.service';
import { MenuService } from '../../core/ui/menu.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ShortDatePipe } from '../../shared/pipes/format.pipes';

@Component({
  selector: 'app-projects-page',
  imports: [IconComponent, TPipe, RouterLink, EmptyStateComponent, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-page.component.html',
  styleUrl: './page.css',
})
export class ProjectsPageComponent {
  protected readonly projects = inject(ProjectService);
  protected readonly layout = inject(LayoutService);
  private readonly store = inject(ChatStore);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly menu = inject(MenuService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  protected readonly supportsPicker = browserSupport.directoryPicker();
  protected readonly chatCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.store.history()) if (c.projectId) counts.set(c.projectId, (counts.get(c.projectId) ?? 0) + 1);
    return counts;
  });

  protected async create(): Promise<void> {
    const name = await this.dialogs.prompt({
      title: this.i18n.t('project.newTitle'),
      label: this.i18n.t('project.name'),
      placeholder: this.i18n.t('project.namePlaceholder'),
      confirmLabel: this.i18n.t('common.create'),
      maxLength: 120,
    });
    if (!name) return;
    const project = await this.projects.create({ name });
    void this.router.navigate(['/projects', project.id]);
  }

  protected newChat(project: Project): void {
    void this.router.navigate(['/'], { queryParams: { project: project.id, new: Date.now() } });
  }

  protected openMenu(event: MouseEvent, project: Project): void {
    this.menu.toggleAt(event.currentTarget as HTMLElement, [
      {
        id: 'open',
        label: this.i18n.t('project.edit'),
        icon: 'pencil',
        run: () => void this.router.navigate(['/projects', project.id]),
      },
      { id: 'chat', label: this.i18n.t('project.newChat'), icon: 'square-pen', run: () => this.newChat(project) },
      {
        id: 'delete',
        label: this.i18n.t('common.delete'),
        icon: 'trash',
        danger: true,
        separatorBefore: true,
        run: () => void this.remove(project),
      },
    ]);
  }

  protected async remove(project: Project): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('project.deleteTitle'),
      message: this.i18n.t('project.deleteMessage', { name: project.name }),
      confirmLabel: this.i18n.t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await this.projects.remove(project.id);
    this.store.detachProject(project.id);
    this.toast.success(this.i18n.t('toast.projectDeleted'));
  }

  protected sourceKey(p: Project): 'project.source.fs' | 'project.source.snapshot' | 'project.source.none' {
    return p.source === 'fs-access'
      ? 'project.source.fs'
      : p.source === 'snapshot'
        ? 'project.source.snapshot'
        : 'project.source.none';
  }
}
