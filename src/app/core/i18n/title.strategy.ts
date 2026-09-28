import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { ES, TranslationKey } from './es';
import { I18nService } from './i18n.service';

const APP_NAME = 'LLM Workspace';

/** Traduce el `title` de las rutas (claves i18n) y reacciona al cambio de idioma. */
@Injectable({ providedIn: 'root' })
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18nService);
  private readonly key = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      const key = this.key();
      const translated = key && key in ES ? this.i18n.t(key as TranslationKey) : null;
      this.title.setTitle(translated ? `${translated} · ${APP_NAME}` : APP_NAME);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key.set(this.buildTitle(snapshot));
  }
}
