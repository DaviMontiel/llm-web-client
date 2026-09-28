import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MenuItem, MenuService } from '../../../core/ui/menu.service';
import { IconComponent } from '../icon/icon.component';

/** Host global de menús contextuales/desplegables con navegación por teclado. */
@Component({
  selector: 'app-menu-host',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointer($event)',
    '(window:resize)': 'menu.close(false)',
    '(window:blur)': 'menu.close(false)',
  },
  template: `
    @if (menu.state(); as state) {
      <div
        #menuEl
        class="menu"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="state.ariaLabel"
        [style.left.px]="pos().x"
        [style.top.px]="pos().y"
        animate.enter="anim-pop-in"
        (keydown)="onKeydown($event)"
      >
        @for (item of state.items; track item.id) {
          @if (item.separatorBefore) {
            <div class="sep" role="separator"></div>
          }
          <button
            type="button"
            class="item"
            [class.danger]="item.danger"
            [attr.role]="item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'"
            [attr.aria-checked]="item.checked ?? null"
            [disabled]="item.disabled"
            (click)="select(item)"
          >
            @if (item.icon) {
              <app-icon [name]="item.icon" [size]="15" />
            }
            <span class="label">{{ item.label }}</span>
            @if (item.checked) {
              <app-icon name="check" [size]="14" class="check" />
            }
            @if (item.hint) {
              <span class="hint">{{ item.hint }}</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: `
    .menu {
      position: fixed;
      z-index: 120;
      min-width: 200px;
      max-width: 300px;
      padding: 5px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
    }
    .item {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      height: 32px;
      padding: 0 9px;
      border: none;
      background: none;
      border-radius: var(--radius-xs);
      font-size: 13px;
      color: var(--foreground);
      text-align: left;
    }
    .item app-icon {
      color: var(--muted);
    }
    .item:hover:not(:disabled),
    .item:focus-visible {
      background: var(--surface-hover);
      outline: none;
    }
    .item:disabled {
      opacity: 0.45;
    }
    .item.danger,
    .item.danger app-icon {
      color: var(--danger);
    }
    .label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hint {
      font-size: 11.5px;
      color: var(--subtle);
    }
    .check {
      color: var(--accent) !important;
    }
    .sep {
      height: 1px;
      margin: 4px 6px;
      background: var(--border);
    }
  `,
})
export class MenuHostComponent {
  protected readonly menu = inject(MenuService);
  private readonly document = inject(DOCUMENT);
  private readonly menuEl = viewChild<ElementRef<HTMLElement>>('menuEl');
  protected readonly pos = signal({ x: 0, y: 0 });

  constructor() {
    afterRenderEffect(() => {
      const state = this.menu.state();
      const el = this.menuEl()?.nativeElement;
      if (!state || !el) return;
      const rect = el.getBoundingClientRect();
      const vw = this.document.defaultView?.innerWidth ?? 1024;
      const vh = this.document.defaultView?.innerHeight ?? 768;
      let x = state.align === 'end' ? state.x - rect.width : state.x;
      let y = state.y;
      x = Math.max(8, Math.min(x, vw - rect.width - 8));
      if (y + rect.height > vh - 8) {
        y = state.anchorTop !== null ? state.anchorTop - rect.height - 4 : y - rect.height;
        y = Math.max(8, y);
      }
      const current = this.pos();
      if (current.x !== x || current.y !== y) this.pos.set({ x, y });
      if (!el.contains(this.document.activeElement))
        el.querySelector<HTMLButtonElement>('.item:not(:disabled)')?.focus();
    });
  }

  protected select(item: MenuItem): void {
    this.menu.close();
    item.run?.();
  }

  protected onDocumentPointer(event: PointerEvent): void {
    const el = this.menuEl()?.nativeElement;
    if (!el || !this.menu.state()) return;
    const target = event.target as Node | null;
    if (target && el.contains(target)) return;
    const opener = this.menu.state()?.returnFocus;
    // Si se pulsa el botón que abrió el menú, su (click) lo alternará.
    if (opener && target && opener.contains(target) && this.menu.state()?.anchorTop !== null) return;
    this.menu.close(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const el = this.menuEl()?.nativeElement;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('.item:not(:disabled)'));
    const idx = items.indexOf(this.document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(idx + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(idx - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.menu.close();
        break;
      case 'Tab':
        this.menu.close(false);
        break;
    }
  }
}
