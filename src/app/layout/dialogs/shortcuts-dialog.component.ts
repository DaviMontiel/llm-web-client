import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslationKey } from '../../core/i18n/es';
import { TPipe } from '../../core/i18n/t.pipe';
import { SettingsService } from '../../core/settings/settings.service';
import { LayoutService } from '../../core/ui/layout.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';

interface Shortcut {
  keys: string[];
  label: TranslationKey;
}

@Component({
  selector: 'app-shortcuts-dialog',
  imports: [ModalComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal
      [open]="layout.shortcutsOpen()"
      [title]="'shortcuts.title' | t"
      size="sm"
      (closed)="layout.shortcutsOpen.set(false)"
    >
      <dl class="list">
        @for (s of shortcuts(); track s.label) {
          <div class="row">
            <dt>{{ s.label | t }}</dt>
            <dd>
              @for (k of s.keys; track $index) {
                <kbd>{{ k }}</kbd>
              }
            </dd>
          </div>
        }
      </dl>
    </app-modal>
  `,
  styles: `
    .list {
      margin: 0;
      display: flex;
      flex-direction: column;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13.5px;
    }
    .row:last-child {
      border-bottom: none;
    }
    dd {
      display: flex;
      gap: 4px;
      margin: 0;
    }
  `,
})
export class ShortcutsDialogComponent {
  protected readonly layout = inject(LayoutService);
  private readonly settings = inject(SettingsService);
  private readonly mod =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
      ? '⌘'
      : 'Ctrl';

  protected readonly shortcuts = computed<Shortcut[]>(() => {
    const enter = this.settings.settings().enterToSend;
    return [
      { keys: [this.mod, 'K'], label: 'shortcuts.search' },
      { keys: [this.mod, '⇧', 'O'], label: 'shortcuts.newChat' },
      { keys: [this.mod, 'B'], label: 'shortcuts.toggleSidebar' },
      { keys: [this.mod, '/'], label: 'shortcuts.show' },
      { keys: enter ? ['Enter'] : [this.mod, 'Enter'], label: 'shortcuts.send' },
      { keys: enter ? ['⇧', 'Enter'] : ['Enter'], label: 'shortcuts.newline' },
      { keys: ['Esc'], label: 'shortcuts.close' },
      { keys: ['↑'], label: 'shortcuts.editLast' },
    ];
  });
}
