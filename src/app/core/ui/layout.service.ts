import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export type RightPanel = 'none' | 'files' | 'context';

const PANEL_KEY = 'lwc.layout';

/** Estado del layout: sidebar/drawer, panel derecho y diálogos globales. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly document = inject(DOCUMENT);
  private readonly mq = this.document.defaultView?.matchMedia?.('(max-width: 900px)');

  readonly isMobile = signal(this.mq?.matches ?? false);
  /** En escritorio: sidebar visible. En móvil: drawer abierto. */
  readonly sidebarOpen = signal(!(this.mq?.matches ?? false));
  readonly rightPanel = signal<RightPanel>('none');
  readonly searchOpen = signal(false);
  readonly shortcutsOpen = signal(false);
  readonly onboardingOpen = signal(false);

  constructor() {
    this.mq?.addEventListener?.('change', (e) => {
      this.isMobile.set(e.matches);
      this.sidebarOpen.set(!e.matches);
      if (e.matches) this.rightPanel.set('none');
    });
    try {
      const saved = this.document.defaultView?.localStorage.getItem(PANEL_KEY);
      if (saved === 'collapsed' && !this.isMobile()) this.sidebarOpen.set(false);
    } catch {
      /* sin localStorage */
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
    if (!this.isMobile()) {
      try {
        this.document.defaultView?.localStorage.setItem(PANEL_KEY, this.sidebarOpen() ? 'open' : 'collapsed');
      } catch {
        /* sin localStorage */
      }
    }
  }

  closeDrawerOnMobile(): void {
    if (this.isMobile()) this.sidebarOpen.set(false);
  }

  toggleRightPanel(panel: Exclude<RightPanel, 'none'>): void {
    this.rightPanel.update((p) => (p === panel ? 'none' : panel));
  }
}
