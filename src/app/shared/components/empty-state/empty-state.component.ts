import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icons';

@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" [class.compact]="compact()">
      <div class="glyph"><app-icon [name]="icon()" [size]="compact() ? 18 : 22" /></div>
      <p class="title">{{ title() }}</p>
      @if (description()) {
        <p class="desc">{{ description() }}</p>
      }
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 40px 20px;
      animation: fade-in var(--dur-slow) var(--ease-out);
    }
    .empty.compact {
      padding: 22px 12px;
    }
    .glyph {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--muted);
      margin-bottom: 14px;
    }
    .compact .glyph {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .title {
      font-weight: 600;
      font-size: 14px;
    }
    .compact .title {
      font-size: 13px;
    }
    .desc {
      margin-top: 4px;
      max-width: 340px;
      color: var(--muted);
      font-size: 13px;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('sparkles');
  readonly title = input.required<string>();
  readonly description = input('');
  readonly compact = input(false);
}
