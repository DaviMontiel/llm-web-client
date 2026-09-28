import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslationKey } from '../../core/i18n/es';
import { TPipe } from '../../core/i18n/t.pipe';
import { LayoutService } from '../../core/ui/layout.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { IconName } from '../../shared/components/icon/icons';

interface NavItem {
  path: string;
  label: TranslationKey;
  icon: IconName;
}

@Component({
  selector: 'app-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings">
      <header class="top">
        @if (!layout.sidebarOpen() || layout.isMobile()) {
          <button
            type="button"
            class="icon-btn"
            (click)="layout.toggleSidebar()"
            [attr.aria-label]="'sidebar.open' | t"
          >
            <app-icon [name]="layout.isMobile() ? 'menu' : 'panel-left'" />
          </button>
        }
        <h1>{{ 'settings.title' | t }}</h1>
      </header>
      <div class="layout">
        <nav class="nav" [attr.aria-label]="'settings.title' | t">
          @for (item of items; track item.path) {
            <a class="nav-item" [routerLink]="item.path" routerLinkActive="is-active" ariaCurrentWhenActive="page">
              <app-icon [name]="item.icon" [size]="15" />
              <span>{{ item.label | t }}</span>
            </a>
          }
        </nav>
        <div class="content">
          <router-outlet />
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }
    .settings {
      max-width: 1000px;
      margin: 0 auto;
      padding: 28px 28px 64px;
      animation: fade-in var(--dur-slow) var(--ease-out);
    }
    .top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .layout {
      display: grid;
      grid-template-columns: 190px minmax(0, 1fr);
      gap: 32px;
      align-items: start;
    }
    .nav {
      position: sticky;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 34px;
      padding: 0 10px;
      border-radius: var(--radius-sm);
      color: var(--muted);
      font-size: 13.5px;
      text-decoration: none !important;
      transition:
        background var(--dur-fast),
        color var(--dur-fast);
    }
    .nav-item:hover {
      background: var(--surface-hover);
      color: var(--foreground);
    }
    .nav-item.is-active {
      background: var(--surface-active);
      color: var(--foreground);
      font-weight: 500;
    }
    @media (max-width: 760px) {
      .settings {
        padding: 16px 14px 48px;
      }
      .layout {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .nav {
        position: static;
        flex-direction: row;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .nav-item {
        flex-shrink: 0;
      }
    }
  `,
})
export class SettingsLayoutComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly items: readonly NavItem[] = [
    { path: 'general', label: 'settings.nav.general', icon: 'settings' },
    { path: 'models', label: 'settings.nav.models', icon: 'cpu' },
    { path: 'themes', label: 'settings.nav.themes', icon: 'palette' },
    { path: 'chat', label: 'settings.nav.chat', icon: 'message-square' },
    { path: 'files', label: 'settings.nav.files', icon: 'files' },
    { path: 'data', label: 'settings.nav.data', icon: 'database' },
  ];
}
