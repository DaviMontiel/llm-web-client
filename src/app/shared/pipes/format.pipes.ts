import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { formatBytes, formatTokens } from '../../core/utils/format';

@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(bytes: number | null | undefined): string {
    return bytes === null || bytes === undefined ? '—' : formatBytes(bytes, this.i18n.locale());
  }
}

@Pipe({ name: 'tokens' })
export class TokensPipe implements PipeTransform {
  transform(tokens: number | null | undefined): string {
    return tokens === null || tokens === undefined ? '—' : formatTokens(tokens);
  }
}

/** Fecha corta localizada. Impuro para reaccionar al idioma (cálculo trivial). */
@Pipe({ name: 'shortDate', pure: false })
export class ShortDatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(timestamp: number | null | undefined, withTime = false): string {
    if (!timestamp) return '';
    const opts: Intl.DateTimeFormatOptions = withTime
      ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat(this.i18n.locale(), opts).format(timestamp);
  }
}
