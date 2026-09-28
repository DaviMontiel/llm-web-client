import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { Toast, ToastService } from '../../../core/ui/toast.service';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icons';

@Component({
  selector: 'app-toast-host',
  imports: [IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" role="region" [attr.aria-label]="'toast.region' | t">
      <div aria-live="polite" aria-atomic="false" class="live">
        @for (toast of toasts.toasts(); track toast.id) {
          <div
            class="toast"
            [class]="'kind-' + toast.kind"
            animate.enter="toast-enter"
            animate.leave="toast-leave"
            [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
          >
            <app-icon [name]="icon(toast)" [size]="15" class="kind-icon" />
            <div class="text">
              <span class="msg">{{ toast.message }}</span>
              @if (toast.detail) {
                <span class="detail">{{ toast.detail }}</span>
              }
            </div>
            @if (toast.action; as action) {
              <button type="button" class="btn btn-ghost btn-sm" (click)="action.run(); toasts.dismiss(toast.id)">
                {{ action.label }}
              </button>
            }
            <button
              type="button"
              class="icon-btn icon-btn-sm"
              (click)="toasts.dismiss(toast.id)"
              [attr.aria-label]="'common.close' | t"
            >
              <app-icon name="x" [size]="13" />
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      z-index: 130;
      pointer-events: none;
      width: min(420px, calc(100vw - 24px));
    }
    .live {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 100%;
      padding: 8px 8px 8px 12px;
      border-radius: var(--radius-md);
      background: var(--foreground);
      color: var(--background);
      box-shadow: var(--shadow-lg);
      font-size: 13px;
    }
    .toast .icon-btn {
      color: inherit;
      opacity: 0.6;
    }
    .toast .icon-btn:hover {
      background: rgba(127, 127, 127, 0.2);
      opacity: 1;
      color: inherit;
    }
    .toast .btn {
      color: inherit;
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .detail {
      opacity: 0.7;
      font-size: 12px;
    }
    .kind-success .kind-icon {
      color: var(--success);
    }
    .kind-error .kind-icon {
      color: var(--danger);
    }
    .kind-warning .kind-icon {
      color: var(--warning);
    }
    .toast-enter {
      animation: rise-in var(--dur) var(--ease-out);
    }
    .toast-leave {
      animation: fade-out var(--dur-fast) ease forwards;
    }
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);

  protected icon(toast: Toast): IconName {
    switch (toast.kind) {
      case 'success':
        return 'circle-check';
      case 'error':
        return 'circle-alert';
      case 'warning':
        return 'triangle-alert';
      default:
        return 'info';
    }
  }
}
