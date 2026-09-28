import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationKey } from '../../../core/i18n/es';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { ProviderConfigService } from '../../../core/llm/provider-config.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IconName } from '../../../shared/components/icon/icons';

interface Suggestion {
  icon: IconName;
  label: TranslationKey;
  prompt: TranslationKey;
}

const SUGGESTIONS: readonly Suggestion[] = [
  { icon: 'folder-tree', label: 'welcome.s1', prompt: 'welcome.s1.prompt' },
  { icon: 'bug', label: 'welcome.s2', prompt: 'welcome.s2.prompt' },
  { icon: 'wand-sparkles', label: 'welcome.s3', prompt: 'welcome.s3.prompt' },
  { icon: 'book-open', label: 'welcome.s4', prompt: 'welcome.s4.prompt' },
];

/** Estado vacío del chat: minimalista, con sugerencias opcionales. */
@Component({
  selector: 'app-welcome',
  imports: [IconComponent, TPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="welcome">
      <div class="mark" aria-hidden="true"><app-icon name="sparkles" [size]="20" /></div>
      <h1>{{ 'welcome.title' | t }}</h1>
      <p class="lead">
        {{ projectName() ? ('welcome.leadProject' | t: { name: projectName() ?? '' }) : ('welcome.lead' | t) }}
      </p>

      @if (!providers.hasConfiguredProvider()) {
        <div class="setup">
          <app-icon name="key-round" [size]="15" />
          <span>{{ 'welcome.noModel' | t }}</span>
          <a class="btn btn-sm btn-primary" routerLink="/settings/models">{{ 'welcome.configure' | t }}</a>
        </div>
      }

      <div class="suggestions">
        @for (s of suggestions; track s.label) {
          <button type="button" class="suggestion" (click)="pick.emit(i18n.t(s.prompt))">
            <app-icon [name]="s.icon" [size]="15" />
            <span>{{ s.label | t }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 8px 16px 20px;
      animation: rise-in 420ms var(--ease-out);
    }
    .mark {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--accent-soft);
      color: var(--accent);
      margin-bottom: 18px;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -0.025em;
    }
    .lead {
      margin-top: 8px;
      color: var(--muted);
      font-size: 14.5px;
    }
    .setup {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 18px;
      padding: 8px 8px 8px 14px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      font-size: 13px;
      color: var(--muted);
    }
    .suggestions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 26px;
      max-width: 620px;
    }
    .suggestion {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 14px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: transparent;
      font-size: 13px;
      color: var(--muted);
      transition:
        background var(--dur-fast),
        color var(--dur-fast),
        border-color var(--dur-fast),
        transform var(--dur-fast);
    }
    .suggestion:hover {
      background: var(--surface);
      border-color: var(--border-strong);
      color: var(--foreground);
      transform: translateY(-1px);
    }
    @media (max-width: 640px) {
      h1 {
        font-size: 22px;
      }
    }
  `,
})
export class WelcomeComponent {
  protected readonly providers = inject(ProviderConfigService);
  protected readonly i18n = inject(I18nService);
  readonly projectName = input<string | null>(null);
  readonly pick = output<string>();
  protected readonly suggestions = SUGGESTIONS;
}
