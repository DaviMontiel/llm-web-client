import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Interruptor accesible (`role="switch"`) basado en <button>. */
@Component({
  selector: 'app-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      class="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label() || null"
      [attr.aria-describedby]="describedBy() || null"
      [disabled]="disabled()"
      (click)="checked.set(!checked())"
    >
      <span class="thumb"></span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .switch {
      position: relative;
      width: 34px;
      height: 20px;
      padding: 0;
      border: none;
      border-radius: 999px;
      background: var(--border-strong);
      transition: background var(--dur) ease;
      flex-shrink: 0;
    }
    .switch[aria-checked='true'] {
      background: var(--accent);
    }
    .switch:disabled {
      opacity: 0.5;
    }
    .thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
      transition: transform var(--dur) var(--ease-out);
    }
    .switch[aria-checked='true'] .thumb {
      transform: translateX(14px);
    }
  `,
})
export class SwitchComponent {
  readonly checked = model(false);
  readonly label = input('');
  readonly describedBy = input('');
  readonly disabled = input(false);
}
