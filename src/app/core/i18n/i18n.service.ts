import { Injectable, computed, signal } from '@angular/core';
import { Language } from '../models';
import { EN } from './en';
import { ES, TranslationKey } from './es';

export type TranslationParams = Record<string, string | number>;

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { es: ES, en: EN };

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Traducciones ligeras basadas en signals, sin dependencias externas. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly language = signal<Language>('es');
  readonly locale = computed(() => (this.language() === 'es' ? 'es-ES' : 'en-US'));

  setLanguage(lang: Language): void {
    this.language.set(lang);
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }

  t(key: TranslationKey, params?: TranslationParams): string {
    const dict = DICTIONARIES[this.language()];
    return interpolate(dict[key] ?? ES[key] ?? key, params);
  }
}
