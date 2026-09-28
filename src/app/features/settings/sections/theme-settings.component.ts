import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TPipe } from '../../../core/i18n/t.pipe';
import { SettingsService } from '../../../core/settings/settings.service';
import { THEMES } from '../../../core/theme/themes';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-theme-settings',
  imports: [TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./settings-section.css'],
  template: `
    <div class="section-head">
      <h2>{{ 'settings.nav.themes' | t }}</h2>
      <p>{{ 'settings.themes.desc' | t }}</p>
    </div>
    <div class="themes" role="radiogroup" [attr.aria-label]="'settings.nav.themes' | t">
      @for (theme of themes; track theme.id) {
        <button
          type="button"
          class="theme"
          role="radio"
          [attr.aria-checked]="settings.settings().themeId === theme.id"
          [class.is-active]="settings.settings().themeId === theme.id"
          (click)="settings.update({ themeId: theme.id })"
        >
          <span class="preview" [style.background]="theme.preview.background" aria-hidden="true">
            @if (theme.scheme === 'system') {
              <span class="split" [style.background]="theme.preview.surface"></span>
            }
            <span
              class="win"
              [style.background]="theme.scheme === 'system' ? 'transparent' : theme.preview.surface"
              [style.border-color]="theme.preview.foreground + '22'"
            >
              <span class="bar" [style.background]="theme.preview.foreground" style="width: 60%"></span>
              <span class="bar" [style.background]="theme.preview.foreground" style="width: 40%; opacity: 0.5"></span>
              <span class="pill" [style.background]="theme.preview.accent"></span>
            </span>
          </span>
          <span class="meta">
            <span class="name">{{ theme.nameKey | t }}</span>
            <span class="desc">{{ theme.descriptionKey | t }}</span>
          </span>
          @if (settings.settings().themeId === theme.id) {
            <app-icon name="circle-check" [size]="16" class="check" />
          }
        </button>
      }
    </div>
  `,
  styles: `
    .themes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .theme {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
      text-align: left;
      color: var(--foreground);
      transition:
        border-color var(--dur-fast),
        box-shadow var(--dur-fast),
        transform var(--dur-fast);
    }
    .theme:hover {
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }
    .theme.is-active {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .preview {
      position: relative;
      display: block;
      height: 84px;
      border-radius: var(--radius-md);
      overflow: hidden;
      padding: 12px;
    }
    .split {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 50%;
    }
    .win {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
      height: 100%;
      padding: 10px;
      border: 1px solid;
      border-radius: 8px;
    }
    .bar {
      height: 6px;
      border-radius: 3px;
      opacity: 0.8;
    }
    .pill {
      margin-top: auto;
      width: 34px;
      height: 10px;
      border-radius: 5px;
    }
    .meta {
      display: flex;
      flex-direction: column;
      padding: 0 2px 2px;
    }
    .name {
      font-size: 13.5px;
      font-weight: 600;
    }
    .desc {
      font-size: 12px;
      color: var(--muted);
    }
    .check {
      position: absolute;
      top: 16px;
      right: 16px;
      color: var(--accent);
      background: var(--surface);
      border-radius: 50%;
    }
  `,
})
export class ThemeSettingsComponent {
  protected readonly settings = inject(SettingsService);
  protected readonly themes = THEMES;
}
