import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { MotionPreference } from '../models';
import { findTheme } from './themes';

export const THEME_CACHE_KEY = 'lwc.theme';

/**
 * Aplica el tema activo mediante `data-theme` en <html>. Cachea el id en
 * localStorage para que el script inline de index.html lo aplique antes
 * del primer render (sin parpadeo). La fuente de verdad son los Settings.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly systemDark = signal(false);
  private readonly themeId = signal('system');
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  readonly resolvedThemeId = computed(() => {
    const theme = findTheme(this.themeId());
    if (theme.scheme !== 'system') return theme.id;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    const win = this.document.defaultView;
    const mq = win?.matchMedia?.('(prefers-color-scheme: dark)');
    if (mq) {
      this.systemDark.set(mq.matches);
      mq.addEventListener?.('change', (e) => {
        this.systemDark.set(e.matches);
        this.applyToDom(true);
      });
    }
  }

  apply(themeId: string, animate = true): void {
    this.themeId.set(findTheme(themeId).id);
    this.applyToDom(animate);
    try {
      this.document.defaultView?.localStorage.setItem(THEME_CACHE_KEY, this.themeId());
    } catch {
      /* localStorage no disponible: el tema se aplicará igualmente tras cargar Settings. */
    }
  }

  applyMotion(pref: MotionPreference): void {
    this.document.documentElement.dataset['motion'] = pref;
  }

  private applyToDom(animate: boolean): void {
    const root = this.document.documentElement;
    const next = this.resolvedThemeId();
    if (root.dataset['theme'] === next) return;
    if (animate) {
      root.classList.add('theme-transition');
      if (this.transitionTimer) clearTimeout(this.transitionTimer);
      this.transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 320);
    }
    root.dataset['theme'] = next;
  }
}
