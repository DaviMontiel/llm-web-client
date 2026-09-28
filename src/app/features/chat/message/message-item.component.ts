import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { copyText } from '../../../core/filesystem/fs-support';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { AppErrorCode, Message } from '../../../core/models';
import { ToastService } from '../../../core/ui/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { AutosizeDirective } from '../../../shared/directives/autosize.directive';
import { MarkdownViewComponent } from '../../../shared/markdown/markdown-view.component';
import { FileSizePipe, TokensPipe } from '../../../shared/pipes/format.pipes';
import { AttachmentChipComponent } from '../composer/attachment-chip.component';

export interface BranchInfo {
  index: number;
  count: number;
}

@Component({
  selector: 'app-message-item',
  imports: [
    IconComponent,
    TPipe,
    MarkdownViewComponent,
    AttachmentChipComponent,
    AutosizeDirective,
    RouterLink,
    FileSizePipe,
    TokensPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-item.component.html',
  styleUrl: './message-item.component.css',
  host: {
    '[class.is-user]': 'isUser()',
    '[class.is-highlighted]': 'highlighted()',
    '[attr.data-message-id]': 'message().id',
  },
})
export class MessageItemComponent {
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly message = input.required<Message>();
  readonly branch = input<BranchInfo | null>(null);
  /** El chat tiene una generación en curso (bloquea acciones que cambian ramas). */
  readonly busy = input(false);
  readonly highlighted = input(false);

  readonly edit = output<string>();
  readonly regenerate = output<void>();
  readonly retry = output<void>();
  readonly continueFrom = output<void>();
  readonly remove = output<void>();
  readonly switchBranch = output<-1 | 1>();

  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  protected readonly copied = signal(false);
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  protected readonly isUser = computed(() => this.message().role === 'user');
  protected readonly streaming = computed(() => this.message().status === 'streaming');
  protected readonly waiting = computed(() => this.streaming() && !this.message().content);
  protected readonly hasUsage = computed(() => {
    const u = this.message().usage;
    return !!u && (u.inputTokens !== undefined || u.outputTokens !== undefined);
  });

  protected errorKey(code: AppErrorCode): `error.${AppErrorCode}` {
    return `error.${code}`;
  }

  startEdit(): void {
    if (!this.isUser() || this.busy()) return;
    this.draft.set(this.message().content);
    this.editing.set(true);
    setTimeout(() => {
      const el = this.editor()?.nativeElement;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  protected cancelEdit(): void {
    this.editing.set(false);
  }

  protected saveEdit(): void {
    const text = this.draft().trim();
    if (!text && this.message().attachments.length === 0) return;
    this.editing.set(false);
    if (text !== this.message().content.trim()) this.edit.emit(text);
  }

  protected onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelEdit();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.saveEdit();
    }
  }

  protected async copy(): Promise<void> {
    const ok = await copyText(this.message().content);
    if (ok) {
      this.copied.set(true);
      this.toast.success(this.i18n.t('toast.copied'));
      setTimeout(() => this.copied.set(false), 1500);
    } else {
      this.toast.error(this.i18n.t('toast.copyFailed'));
    }
  }
}
