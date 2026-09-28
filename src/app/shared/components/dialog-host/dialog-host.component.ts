import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TPipe } from '../../../core/i18n/t.pipe';
import { DialogService } from '../../../core/ui/dialog.service';
import { ModalComponent } from '../modal/modal.component';

/** Renderiza los diálogos de confirmación / entrada de texto del DialogService. */
@Component({
  selector: 'app-dialog-host',
  imports: [ModalComponent, FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let req = dialogs.current();
    <app-modal [open]="!!req" [title]="req?.options?.title ?? ''" size="sm" (closed)="dialogs.close(null)">
      @if (req) {
        <form (submit)="$event.preventDefault(); submit()">
          @if (req.options.message) {
            <p class="message">{{ req.options.message }}</p>
          }
          @if (req.type === 'prompt') {
            <label class="field">
              <span class="field-label">{{ req.options.label }}</span>
              <input
                class="input"
                name="value"
                [ngModel]="value()"
                (ngModelChange)="value.set($event)"
                [placeholder]="req.options.placeholder ?? ''"
                [attr.maxlength]="req.options.maxLength ?? 200"
                autocomplete="off"
                cdkFocusInitial
              />
            </label>
          }
          <div class="actions">
            <button type="button" class="btn btn-ghost" (click)="dialogs.close(null)">
              {{ (req.type === 'confirm' ? req.options.cancelLabel : null) ?? ('common.cancel' | t) }}
            </button>
            <button
              type="submit"
              class="btn"
              [class.btn-primary]="!danger()"
              [class.btn-danger-solid]="danger()"
              [disabled]="req.type === 'prompt' && !value().trim()"
              [attr.cdkFocusInitial]="req.type === 'confirm' ? '' : null"
            >
              {{ req.options.confirmLabel ?? ('common.confirm' | t) }}
            </button>
          </div>
        </form>
      }
    </app-modal>
  `,
  styles: `
    .message {
      color: var(--muted);
      font-size: 13.5px;
      margin-bottom: 14px;
      white-space: pre-line;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 18px;
    }
  `,
})
export class DialogHostComponent {
  protected readonly dialogs = inject(DialogService);
  protected readonly value = signal('');
  protected readonly danger = computed(() => {
    const req = this.dialogs.current();
    return req?.type === 'confirm' && !!req.options.danger;
  });

  constructor() {
    effect(() => {
      const req = this.dialogs.current();
      this.value.set(req?.type === 'prompt' ? (req.options.value ?? '') : '');
    });
  }

  protected submit(): void {
    const req = this.dialogs.current();
    if (!req) return;
    if (req.type === 'confirm') this.dialogs.close(true);
    else if (this.value().trim()) this.dialogs.close(this.value().trim());
  }
}
