import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatStore } from '../../../core/chat/chat-store.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { AppError, ModelRef } from '../../../core/models';
import { ProjectService } from '../../../core/projects/project.service';
import { CodeActionsService } from '../../../core/ui/code-actions.service';
import { LayoutService } from '../../../core/ui/layout.service';
import { ToastService } from '../../../core/ui/toast.service';
import { getPathToLeaf } from '../../../core/utils/conversation-tree';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { ComposerComponent, ComposerSubmit } from '../composer/composer.component';
import { ContextPanelComponent } from '../context-panel/context-panel.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { WelcomeComponent } from '../welcome/welcome.component';

/** Vista principal de una conversación (`/chat/:id`). */
@Component({
  selector: 'app-chat-page',
  imports: [
    ChatHeaderComponent,
    MessageListComponent,
    ComposerComponent,
    WelcomeComponent,
    ContextPanelComponent,
    EmptyStateComponent,
    IconComponent,
    TPipe,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.css',
})
export class ChatPageComponent {
  protected readonly store = inject(ChatStore);
  protected readonly layout = inject(LayoutService);
  private readonly projects = inject(ProjectService);
  private readonly codeActions = inject(CodeActionsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  /** Parámetros de ruta (withComponentInputBinding). */
  readonly id = input.required<string>();
  readonly m = input<string | undefined>(undefined);

  private readonly composer = viewChild(ComposerComponent);
  private readonly list = viewChild(MessageListComponent);

  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly chat = computed(() => this.store.chat(this.id()));
  protected readonly allMessages = computed(() => this.store.messagesOf(this.id())());
  protected readonly path = computed(() => getPathToLeaf(this.allMessages(), this.chat()?.activeLeafId ?? null));
  protected readonly generating = computed(() => this.store.generatingChats().has(this.id()));
  protected readonly modelRef = computed(() => {
    const chat = this.chat();
    return chat ? this.store.resolveModelRef(chat) : null;
  });
  protected readonly project = computed(() => this.projects.get(this.chat()?.projectId));
  protected readonly isEmpty = computed(() => this.path().length === 0);
  protected readonly forked = computed(() => {
    const chat = this.chat();
    const leaf = chat?.activeLeafId;
    return !!leaf && !this.generating() && this.allMessages().some((msg) => msg.parentId === leaf);
  });

  protected readonly submit = (value: ComposerSubmit): Promise<boolean> => this.send(value);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.store.activeChatId.set(id);
        this.loadState.set('loading');
        this.store
          .ensureMessages(id)
          .then(() => this.loadState.set('ready'))
          .catch(() => this.loadState.set('error'));
      });
    });

    effect(() => this.codeActions.activeProjectId.set(this.chat()?.projectId ?? null));

    // Resaltado de un mensaje abierto desde la búsqueda: activar su rama si hace falta.
    effect(() => {
      const target = this.m();
      const ready = this.loadState() === 'ready';
      if (!target || !ready) return;
      untracked(() => {
        const inPath = this.path().some((msg) => msg.id === target);
        if (!inPath && this.allMessages().some((msg) => msg.id === target)) {
          this.store.continueFrom(this.id(), target);
          this.store.returnToLatest(this.id());
        }
      });
    });
  }

  private async send(value: ComposerSubmit): Promise<boolean> {
    const chat = this.chat();
    if (!chat) return false;
    try {
      const ok = await this.store.send(chat.id, value);
      if (!ok) this.toast.warning(this.i18n.t('chat.busy'));
      else if (this.m()) void this.router.navigate(['/chat', chat.id], { replaceUrl: true });
      return ok;
    } catch (error) {
      this.toast.error(error instanceof AppError ? error.message : this.i18n.t('error.unknown'));
      return false;
    }
  }

  protected stop(): void {
    this.store.stop(this.id());
  }

  protected setModel(ref: ModelRef): void {
    this.store.setModel(this.id(), ref);
  }

  protected setTemporary(value: boolean): void {
    void this.store.setTemporary(this.id(), value);
  }

  protected useSuggestion(text: string): void {
    this.composer()?.setText(text);
  }

  protected editLast(): void {
    this.list()?.editLastUserMessage();
  }

  protected returnToLatest(): void {
    this.store.returnToLatest(this.id());
  }

  protected async attachFromProject(path: string): Promise<void> {
    const chat = this.chat();
    if (!chat?.projectId) return;
    try {
      const file = await this.projects.readAsFile(chat.projectId, path);
      await this.composer()?.addFiles([file], 'project', [path]);
    } catch {
      this.toast.error(this.i18n.t('error.fileRead', { name: path }));
    }
  }
}
