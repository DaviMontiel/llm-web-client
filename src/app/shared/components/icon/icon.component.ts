import { ChangeDetectionStrategy, Component, ElementRef, Renderer2, effect, inject, input } from '@angular/core';
import { ICONS, IconName } from './icons';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Icono SVG construido con Renderer2 (sin innerHTML). Decorativo por
 * defecto (`aria-hidden`); pasa `label` para iconos con significado.
 */
@Component({
  selector: 'app-icon',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'app-icon',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 0;
    }
    :host ::ng-deep svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class IconComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  readonly name = input.required<IconName>();
  readonly size = input(16);
  readonly strokeWidth = input(1.75);
  readonly label = input<string>('');

  constructor() {
    effect(() => this.render(this.name(), this.strokeWidth()));
  }

  private render(name: IconName, strokeWidth: number): void {
    const el = this.host.nativeElement;
    while (el.firstChild) el.removeChild(el.firstChild);
    const svg = this.renderer.createElement('svg', 'svg') as SVGElement;
    const attrs: Record<string, string> = {
      xmlns: SVG_NS,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': String(strokeWidth),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
    };
    for (const [k, v] of Object.entries(attrs)) this.renderer.setAttribute(svg, k, v);
    for (const [tag, props] of ICONS[name] ?? []) {
      const child = this.renderer.createElement(tag, 'svg') as SVGElement;
      for (const [k, v] of Object.entries(props)) {
        if (v !== undefined && v !== null) this.renderer.setAttribute(child, k, String(v));
      }
      this.renderer.appendChild(svg, child);
    }
    this.renderer.appendChild(el, svg);
  }
}
