import { ChangeDetectionStrategy, Component, effect, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ChatStore } from '../../core/chat/chat-store.service';
import { ProjectService } from '../../core/projects/project.service';
import { SettingsService } from '../../core/settings/settings.service';

/**
 * Ruta `/`: crea inmediatamente una conversación nueva (o reutiliza una
 * vacía) y navega a ella. Admite `?project=<id>` y `?temporary=1`.
 */
@Component({
  selector: 'app-new-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="boot" aria-busy="true"></div>`,
  styles: `
    :host {
      display: block;
      flex: 1;
    }
  `,
})
export class NewChatComponent {
  private readonly store = inject(ChatStore);
  private readonly settings = inject(SettingsService);
  private readonly projects = inject(ProjectService);
  private readonly router = inject(Router);

  readonly project = input<string | undefined>(undefined);
  readonly temporary = input<string | undefined>(undefined);
  /** Marca de tiempo para forzar un chat nuevo aunque ya estemos en `/`. */
  readonly new = input<string | undefined>(undefined);

  constructor() {
    effect(() => {
      const projectId = this.project();
      const temporary =
        this.temporary() === '1' || (this.temporary() === undefined && this.settings.settings().temporaryByDefault);
      this.new();
      untracked(() => void this.open(projectId ?? null, temporary));
    });
  }

  private async open(projectId: string | null, temporary: boolean): Promise<void> {
    const project = this.projects.get(projectId);
    const reusable = this.store
      .chats()
      .find(
        (c) =>
          c.activeLeafId === null &&
          !c.titleLocked &&
          c.temporary === temporary &&
          c.projectId === (project?.id ?? null),
      );
    const chat =
      reusable ??
      (await this.store.createChat({
        temporary,
        projectId: project?.id ?? null,
        model: project?.defaultModel ?? this.settings.settings().defaultModel,
      }));
    void this.router.navigate(['/chat', chat.id], { replaceUrl: true });
  }
}
