import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService, TranslationParams } from './i18n.service';
import { TranslationKey } from './es';

/**
 * `{{ 'chat.new' | t }}`. Impuro para reaccionar al cambio de idioma; la
 * búsqueda en diccionario es O(1), por lo que el coste es despreciable.
 */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: TranslationKey, params?: TranslationParams): string {
    return this.i18n.t(key, params);
  }
}
