import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ChatStore } from '../../../core/chat/chat-store.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { Message } from '../../../core/models';
import { SettingsService } from '../../../core/settings/settings.service';
import { DialogService } from '../../../core/ui/dialog.service';
import { buildChildrenIndex } from '../../../core/utils/conversation-tree';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { BranchInfo, MessageItemComponent } from '../message/message-item.component';

const PAGE = 60;
const BOTTOM_THRESHOLD = 80;

/**
 * Lista de mensajes con scroll inteligente: sigue el final solo si el
 * usuario ya estaba abajo; si ha subido, muestra "Nuevos mensajes".
 * Renderiza por ventanas para conversaciones muy largas.
 */
@Component({
  selector: 'app-message-list',
  imports: [MessageItemComponent, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scroller" #scroller (scroll)="onScroll()" tabindex="-1">
      <div class="content" #content role="log" aria-live="off" [attr.aria-label]="'chat.conversation' | t">
        @if (hiddenCount() > 0) {
          <div class="load-more">
            <button type="button" class="btn btn-ghost btn-sm" (click)="showMore()">
              <app-icon name="arrow-up" [size]="13" /> {{ 'chat.showEarlier' | t: { n: hiddenCount() } }}
            </button>
          </div>
        }
        @for (m of visible(); track m.id) {
          <app-message-item
            [message]="m"
            [branch]="branches().get(m.id) ?? null"
            [busy]="busy()"
            [highlighted]="highlightId() === m.id"
            (edit)="store.editAndResend(chatId(), m.id, $event)"
            (regenerate)="store.regenerate(chatId(), m.id)"
            (retry)="store.retry(chatId(), m.id)"
            (continueFrom)="store.continueFrom(chatId(), m.id)"
            (remove)="remove(m)"
            (switchBranch)="store.switchBranch(chatId(), m.id, $event)"
          />
        }
        <ng-content />
      </div>
    </div>
    @if (showNewPill()) {
      <button
        type="button"
        class="new-pill"
        (click)="scrollToBottom(true)"
        animate.enter="anim-rise-in"
        animate.leave="anim-fade-out"
      >
        <app-icon name="arrow-down" [size]="14" /> {{ 'chat.newMessages' | t }}
      </button>
    }
    <div class="sr-only" aria-live="polite">{{ liveStatus() }}</div>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      flex: 1;
      min-height: 0;
    }
    .scroller {
      height: 100%;
      overflow-y: auto;
      overflow-anchor: none;
      outline: none;
    }
    .content {
      max-width: var(--content-width);
      margin: 0 auto;
      padding: 24px 24px 32px;
    }
    .load-more {
      display: flex;
      justify-content: center;
      padding-bottom: 12px;
    }
    .new-pill {
      position: absolute;
      left: 50%;
      bottom: 14px;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 14px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      box-shadow: var(--shadow-md);
      font-size: 12.5px;
      font-weight: 500;
      color: var(--foreground);
      z-index: 5;
    }
    .new-pill:hover {
      background: var(--surface-2);
    }
    @media (max-width: 640px) {
      .content {
        padding: 16px 14px 24px;
      }
    }
  `,
})
export class MessageListComponent {
  protected readonly store = inject(ChatStore);
  private readonly settings = inject(SettingsService);
  private readonly dialogs = inject(DialogService);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  readonly chatId = input.required<string>();
  readonly path = input.required<Message[]>();
  readonly allMessages = input.required<Message[]>();
  readonly busy = input(false);
  readonly highlightId = input<string | null>(null);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly contentEl = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly items = viewChildren(MessageItemComponent);

  private readonly visibleCount = signal(PAGE);
  private readonly stick = signal(true);
  protected readonly hasUnseen = signal(false);

  protected readonly visible = computed(() => this.path().slice(-this.visibleCount()));
  protected readonly hiddenCount = computed(() => Math.max(0, this.path().length - this.visibleCount()));
  protected readonly showNewPill = computed(() => !this.stick() && this.hasUnseen());

  /** Posición en ramas hermanas (solo para mensajes con más de una versión). */
  protected readonly branches = computed(() => {
    const index = buildChildrenIndex(this.allMessages());
    const map = new Map<string, BranchInfo>();
    for (const m of this.path()) {
      const siblings = (index.get(m.parentId) ?? []).filter((s) => s.role === m.role);
      if (siblings.length > 1)
        map.set(m.id, { index: siblings.findIndex((s) => s.id === m.id), count: siblings.length });
    }
    return map;
  });

  protected readonly liveStatus = computed(() => {
    const last = this.path()[this.path().length - 1];
    if (!last || last.role !== 'assistant') return '';
    if (last.status === 'streaming') return this.i18n.t('a11y.generating');
    if (last.status === 'complete') return this.i18n.t('a11y.responseReady');
    return '';
  });

  private lastLength = 0;
  private lastChatId = '';

  constructor() {
    // Cambio de chat: reiniciar ventana y bajar al final.
    effect(() => {
      const id = this.chatId();
      untracked(() => {
        if (id !== this.lastChatId) {
          this.lastChatId = id;
          this.visibleCount.set(PAGE);
          this.stick.set(true);
          this.hasUnseen.set(false);
          this.lastLength = 0;
          setTimeout(() => this.scrollToBottom(false));
        }
      });
    });

    // Nuevo mensaje del usuario → siempre seguir el final.
    effect(() => {
      const path = this.path();
      untracked(() => {
        const last = path[path.length - 1];
        const grew = path.length > this.lastLength;
        this.lastLength = path.length;
        if (!grew || !last) return;
        const prev = path[path.length - 2];
        if (
          last.role === 'user' ||
          (last.role === 'assistant' &&
            last.status === 'streaming' &&
            prev?.role === 'user' &&
            Date.now() - prev.createdAt < 2000)
        ) {
          this.stick.set(true);
          setTimeout(() => this.scrollToBottom(true));
        }
      });
    });

    // Resaltado: asegurar que el mensaje está en la ventana y hacer scroll.
    effect(() => {
      const target = this.highlightId();
      const path = this.path();
      if (!target) return;
      untracked(() => {
        const idx = path.findIndex((m) => m.id === target);
        if (idx < 0) return;
        const needed = path.length - idx;
        if (needed > this.visibleCount()) this.visibleCount.set(needed + 5);
        this.stick.set(false);
        setTimeout(() => {
          const el = this.contentEl().nativeElement.querySelector(`[data-message-id="${CSS.escape(target)}"]`);
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 60);
      });
    });

    afterNextRender(() => {
      const ro = new ResizeObserver(() => this.onContentResize());
      ro.observe(this.contentEl().nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  private onContentResize(): void {
    if (this.stick() && this.settings.settings().autoScroll) {
      this.scrollToBottom(false);
    } else if (!this.stick()) {
      this.hasUnseen.set(true);
    }
  }

  protected onScroll(): void {
    const el = this.scroller().nativeElement;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
    if (atBottom !== this.stick()) this.stick.set(atBottom);
    if (atBottom) this.hasUnseen.set(false);
    if (el.scrollTop < 40 && this.hiddenCount() > 0) this.showMore();
  }

  scrollToBottom(smooth: boolean): void {
    const el = this.scroller().nativeElement;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    this.stick.set(true);
    this.hasUnseen.set(false);
  }

  protected showMore(): void {
    const el = this.scroller().nativeElement;
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    this.visibleCount.update((n) => n + PAGE);
    // Mantener la posición visual tras insertar mensajes arriba.
    setTimeout(() => {
      el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
    });
  }

  /** Abre la edición del último mensaje del usuario (atajo ↑ en el composer). */
  editLastUserMessage(): void {
    const items = this.items();
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].message().role === 'user') {
        items[i].startEdit();
        return;
      }
    }
  }

  protected async remove(message: Message): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('message.deleteTitle'),
      message: this.i18n.t('message.deleteMessage'),
      confirmLabel: this.i18n.t('common.delete'),
      danger: true,
    });
    if (ok) this.store.deleteMessage(this.chatId(), message.id);
  }
}
