import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CodeBlockComponent } from './code-block.component';
import { MarkdownSegment, renderMarkdown, renderMarkdownCached } from './markdown';

const CARET = '<span class="stream-caret"></span>';

/** Inserta el cursor de streaming dentro del último elemento de bloque. */
function withCaret(html: string): string {
  const match = /(<\/[a-z0-9]+>\s*)+$/i.exec(html);
  if (!match) return html + CARET;
  return html.slice(0, match.index) + CARET + html.slice(match.index);
}

/**
 * Renderiza Markdown saneado. Los bloques de código de primer nivel se
 * convierten en componentes; el resto se enlaza con [innerHTML], que pasa
 * por el sanitizador de Angular (sin scripts, handlers ni URLs peligrosas).
 */
@Component({
  selector: 'app-markdown',
  imports: [CodeBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="md">
      @for (seg of segments(); track seg.key) {
        @if (seg.kind === 'html') {
          <div class="md-html" [innerHTML]="seg.html"></div>
        } @else {
          <app-code-block [code]="seg.code" [lang]="seg.lang" [closed]="seg.closed || !streaming()" />
        }
      }
      @if (streaming() && showTrailingCaret()) {
        <span class="stream-caret"></span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .md-html {
      display: contents;
    }
  `,
})
export class MarkdownViewComponent {
  readonly content = input.required<string>();
  readonly streaming = input(false);

  protected readonly segments = computed<MarkdownSegment[]>(() => {
    const text = this.content();
    if (!this.streaming()) return renderMarkdownCached(text);
    const segs = renderMarkdown(text);
    const last = segs[segs.length - 1];
    if (last?.kind === 'html') {
      return [...segs.slice(0, -1), { ...last, html: withCaret(last.html) }];
    }
    return segs;
  });

  /** Cursor al final cuando no hay contenido o el último segmento es un bloque de código cerrado. */
  protected readonly showTrailingCaret = computed(() => {
    const segs = this.segments();
    const last = segs[segs.length - 1];
    return !last || (last.kind === 'code' && last.closed);
  });
}
