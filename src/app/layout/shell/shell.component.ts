import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TPipe } from '../../core/i18n/t.pipe';
import { SettingsService } from '../../core/settings/settings.service';
import { StorageService } from '../../core/storage/storage.service';
import { DialogService } from '../../core/ui/dialog.service';
import { LayoutService } from '../../core/ui/layout.service';
import { MenuService } from '../../core/ui/menu.service';
import { ApplyChangesDialogComponent } from '../../features/projects/apply-changes-dialog.component';
import { SearchDialogComponent } from '../../features/history/search-dialog.component';
import { OnboardingDialogComponent } from '../dialogs/onboarding-dialog.component';
import { ShortcutsDialogComponent } from '../dialogs/shortcuts-dialog.component';
import { DialogHostComponent } from '../../shared/components/dialog-host/dialog-host.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { MenuHostComponent } from '../../shared/components/menu-host/menu-host.component';
import { ToastHostComponent } from '../../shared/components/toast-host/toast-host.component';
import { DropOverlayComponent } from '../drop-overlay/drop-overlay.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

/** Layout principal: sidebar/drawer, contenido y capas globales. */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    SidebarComponent,
    DropOverlayComponent,
    MenuHostComponent,
    ToastHostComponent,
    DialogHostComponent,
    SearchDialogComponent,
    ShortcutsDialogComponent,
    OnboardingDialogComponent,
    ApplyChangesDialogComponent,
    IconComponent,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <a class="skip-link" href="#main-content">{{ 'a11y.skipToContent' | t }}</a>
    <div class="shell" [class.sidebar-open]="layout.sidebarOpen()" [class.mobile]="layout.isMobile()">
      @if (layout.isMobile() && layout.sidebarOpen()) {
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- el cierre por teclado es Escape -->
        <div
          class="scrim"
          animate.enter="anim-fade-in"
          animate.leave="anim-fade-out"
          (click)="layout.sidebarOpen.set(false)"
        ></div>
      }
      <aside
        class="sidebar-slot"
        [attr.aria-hidden]="!layout.sidebarOpen()"
        [attr.inert]="layout.sidebarOpen() ? null : ''"
      >
        <app-sidebar />
      </aside>
      <main class="main" id="main-content" tabindex="-1">
        @if (!storage.persistent()) {
          <div class="storage-banner" role="status">
            <app-icon name="triangle-alert" [size]="14" />
            <span>{{ 'storage.volatile' | t }}</span>
          </div>
        }
        <router-outlet />
      </main>
    </div>

    <app-drop-overlay />
    <app-menu-host />
    <app-toast-host />
    <app-dialog-host />
    <app-search-dialog />
    <app-shortcuts-dialog />
    <app-onboarding-dialog />
    <app-apply-changes-dialog />
  `,
  styles: `
    :host {
      display: block;
      height: 100dvh;
    }
    .skip-link {
      position: fixed;
      top: 8px;
      left: 8px;
      z-index: 200;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      background: var(--surface);
      box-shadow: var(--shadow-md);
      transform: translateY(-200%);
    }
    .skip-link:focus {
      transform: none;
    }
    .shell {
      position: relative;
      display: flex;
      height: 100%;
      overflow: hidden;
    }
    .sidebar-slot {
      flex-shrink: 0;
      width: 0;
      overflow: hidden;
      transition: width var(--dur-slow) var(--ease-out);
    }
    .sidebar-open .sidebar-slot {
      width: var(--sidebar-width);
    }
    .main {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--background);
    }
    .main:focus {
      outline: none;
    }
    .storage-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 6px 12px;
      font-size: 12.5px;
      background: var(--warning-soft);
      color: var(--foreground);
    }
    .storage-banner app-icon {
      color: var(--warning);
    }
    /* Móvil / tablet: el sidebar es un drawer superpuesto. */
    .mobile .sidebar-slot {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 80;
      width: var(--sidebar-width);
      max-width: 86vw;
      transform: translateX(-100%);
      transition: transform var(--dur-slow) var(--ease-out);
      box-shadow: none;
    }
    .mobile.sidebar-open .sidebar-slot {
      transform: translateX(0);
      box-shadow: var(--shadow-lg);
    }
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 79;
      background: var(--overlay);
    }
  `,
})
export class ShellComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly storage = inject(StorageService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly menu = inject(MenuService);
  private readonly dialogs = inject(DialogService);

  private readonly anyModalOpen = computed(
    () =>
      this.layout.searchOpen() ||
      this.layout.shortcutsOpen() ||
      this.layout.onboardingOpen() ||
      !!this.dialogs.current(),
  );

  constructor() {
    if (!this.settings.settings().onboarded) this.layout.onboardingOpen.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && !event.shiftKey && !event.altKey && key === 'k') {
      event.preventDefault();
      this.menu.close(false);
      // Evita que las primeras pulsaciones acaben en el campo que tenía el foco.
      if (!this.layout.searchOpen() && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.layout.searchOpen.set(!this.layout.searchOpen());
      return;
    }
    if (mod && event.shiftKey && key === 'o') {
      event.preventDefault();
      this.menu.close(false);
      void this.router.navigate(['/'], { queryParams: { new: Date.now() } });
      return;
    }
    if (mod && (key === '/' || event.code === 'Slash')) {
      event.preventDefault();
      this.layout.shortcutsOpen.set(!this.layout.shortcutsOpen());
      return;
    }
    if (mod && !event.shiftKey && !event.altKey && key === 'b') {
      event.preventDefault();
      this.layout.toggleSidebar();
      return;
    }
    if (key === 'escape' && !event.defaultPrevented && !this.anyModalOpen() && !this.menu.state()) {
      if (this.layout.isMobile() && this.layout.sidebarOpen()) {
        this.layout.sidebarOpen.set(false);
      } else if (this.layout.rightPanel() !== 'none') {
        this.layout.rightPanel.set('none');
      }
    }
  }
}
