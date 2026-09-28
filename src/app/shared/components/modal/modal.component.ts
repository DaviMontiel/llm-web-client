import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { IconComponent } from '../icon/icon.component';

let nextId = 0;

/**
 * Modal accesible: overlay, animación de entrada/salida, cierre con Escape
 * y clic fuera (configurable), trampa de foco y restauración del foco.
 */
@Component({
  selector: 'app-modal',
  imports: [A11yModule, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- el cierre por teclado es Escape -->
      <div class="overlay" animate.enter="anim-fade-in" animate.leave="anim-fade-out" (click)="onBackdrop()"></div>
      <div class="frame" tabindex="-1" (keydown.escape)="onEscape($event)">
        <section
          #panel
          class="panel"
          [class]="'size-' + size()"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          animate.enter="anim-pop-in"
          animate.leave="anim-pop-out"
          tabindex="-1"
        >
          @if (title()) {
            <header class="head">
              <div class="head-text">
                <h2 [id]="titleId">{{ title() }}</h2>
                @if (subtitle()) {
                  <p class="subtitle">{{ subtitle() }}</p>
                }
              </div>
              <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'common.close' | t">
                <app-icon name="x" />
              </button>
            </header>
          } @else {
            <h2 class="sr-only" [id]="titleId">{{ ariaLabel() }}</h2>
          }
          <div class="body" [class.flush]="flush()">
            <ng-content />
          </div>
          <ng-content select="[modal-footer]" />
        </section>
      </div>
    }
  `,
  styles: `
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: var(--overlay);
      backdrop-filter: blur(2px);
    }
    .frame {
      position: fixed;
      inset: 0;
      z-index: 91;
      display: grid;
      place-items: start center;
      padding: 12vh 16px 16px;
      pointer-events: none;
      overflow-y: auto;
    }
    .panel {
      pointer-events: auto;
      width: 100%;
      max-height: 76vh;
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }
    .panel:focus-visible {
      outline: none;
    }
    .size-sm {
      max-width: 420px;
    }
    .size-md {
      max-width: 560px;
    }
    .size-lg {
      max-width: 820px;
    }
    .size-xl {
      max-width: 1040px;
    }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 16px 8px 20px;
    }
    h2 {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .subtitle {
      margin-top: 2px;
      font-size: 13px;
      color: var(--muted);
    }
    .body {
      padding: 8px 20px 20px;
      overflow-y: auto;
      min-height: 0;
    }
    .body.flush {
      padding: 0;
    }
    @media (max-width: 640px) {
      .frame {
        padding: 8px;
        place-items: end center;
      }
      .panel {
        max-height: 88vh;
      }
    }
  `,
})
export class ModalComponent {
  private readonly document = inject(DOCUMENT);
  readonly open = input.required<boolean>();
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly ariaLabel = input<string>('Dialog');
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  readonly closeOnBackdrop = input(true);
  readonly flush = input(false);
  readonly closed = output<void>();

  protected readonly titleId = `modal-title-${nextId++}`;
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private previousFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      untracked(() => {
        if (isOpen) {
          const active = this.document.activeElement;
          this.previousFocus = active instanceof HTMLElement ? active : null;
        } else if (this.previousFocus) {
          const el = this.previousFocus;
          this.previousFocus = null;
          setTimeout(() => el.isConnected && el.focus());
        }
      });
    });
  }

  protected onBackdrop(): void {
    if (this.closeOnBackdrop()) this.closed.emit();
  }

  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.closed.emit();
  }

  focusPanel(): void {
    this.panel()?.nativeElement.focus();
  }
}
