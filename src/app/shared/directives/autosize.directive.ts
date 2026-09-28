import { Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Autoajusta la altura de un <textarea> a su contenido entre `minRows` y
 * `maxHeight`. Llamar a `resize()` tras cambios programáticos del valor.
 */
@Directive({
  selector: 'textarea[appAutosize]',
  exportAs: 'autosize',
  host: { '(input)': 'resize()' },
})
export class AutosizeDirective {
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);
  readonly maxHeight = input(320);

  constructor() {
    afterNextRender(() => this.resize());
  }

  resize(): void {
    const ta = this.el.nativeElement;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, this.maxHeight());
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > this.maxHeight() ? 'auto' : 'hidden';
  }
}
