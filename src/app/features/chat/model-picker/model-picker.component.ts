import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { AvailableModel, ProviderConfigService } from '../../../core/llm/provider-config.service';
import { ModelRef } from '../../../core/models';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TokensPipe } from '../../../shared/pipes/format.pipes';

interface Group {
  providerId: string;
  providerName: string;
  configured: boolean;
  models: AvailableModel[];
}

/** Selector de modelo agrupado por proveedor, con búsqueda y teclado. */
@Component({
  selector: 'app-model-picker',
  imports: [IconComponent, TPipe, RouterLink, TokensPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onOutside($event)',
  },
  template: `
    <div class="picker" #root>
      <button
        #trigger
        type="button"
        class="trigger"
        [class.compact]="compact()"
        (click)="toggle()"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="('model.select' | t) + ': ' + label()"
        [disabled]="disabled()"
      >
        @if (!compact()) {
          <app-icon name="cpu" [size]="14" class="lead" />
        }
        <span class="name" [class.unset]="!current()">{{ label() }}</span>
        @if (current() && !current()!.configured) {
          <app-icon name="triangle-alert" [size]="13" class="warn" [label]="'model.notConfigured' | t" />
        }
        <app-icon name="chevron-down" [size]="13" class="chev" />
      </button>

      @if (open()) {
        <div
          class="panel"
          tabindex="-1"
          [class.up]="placement() === 'top'"
          animate.enter="anim-pop-in"
          (keydown)="onKeydown($event)"
        >
          <div class="search">
            <app-icon name="search" [size]="13" />
            <input
              #search
              type="text"
              [value]="query()"
              (input)="query.set(search.value); active.set(0)"
              [placeholder]="'model.search' | t"
              [attr.aria-label]="'model.search' | t"
            />
          </div>
          <div class="list" role="listbox" [attr.aria-label]="'model.select' | t">
            @for (group of groups(); track group.providerId) {
              <div class="group-head">
                <span>{{ group.providerName }}</span>
                @if (!group.configured) {
                  <a class="configure" routerLink="/settings/models" (click)="close()">{{ 'model.configure' | t }}</a>
                }
              </div>
              @for (m of group.models; track m.model.id) {
                @let idx = indexOf(m);
                <button
                  type="button"
                  class="option"
                  role="option"
                  [attr.aria-selected]="isSelected(m)"
                  [class.is-active]="idx === active()"
                  [class.is-dim]="!m.configured"
                  (click)="choose(m)"
                  (mousemove)="active.set(idx)"
                  [attr.data-idx]="idx"
                >
                  <span class="opt-main">
                    <span class="opt-name">{{ m.model.name }}</span>
                    <span class="opt-meta">
                      <span class="mono">{{ m.model.id }}</span>
                      @if (m.model.contextWindow) {
                        <span>· {{ m.model.contextWindow | tokens }} {{ 'model.context' | t }}</span>
                      }
                    </span>
                  </span>
                  @if (m.model.capabilities.vision) {
                    <app-icon name="image" [size]="13" class="cap" [label]="'model.vision' | t" />
                  }
                  @if (isSelected(m)) {
                    <app-icon name="check" [size]="14" class="check" />
                  }
                </button>
              }
            } @empty {
              <p class="empty">{{ 'model.none' | t }}</p>
            }
          </div>
          <a class="manage" routerLink="/settings/models" (click)="close()">
            <app-icon name="sliders-horizontal" [size]="13" /> {{ 'model.manage' | t }}
          </a>
        </div>
      }
    </div>
  `,
  styleUrl: './model-picker.component.css',
})
export class ModelPickerComponent {
  private readonly providers = inject(ProviderConfigService);
  private readonly i18n = inject(I18nService);

  readonly value = input<ModelRef | null>(null);
  readonly compact = input(false);
  readonly disabled = input(false);
  readonly placement = input<'bottom' | 'top'>('bottom');
  readonly changed = output<ModelRef>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly root = viewChild<ElementRef<HTMLElement>>('root');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly current = computed(() => this.providers.findModel(this.value()));
  protected readonly label = computed(
    () => this.current()?.model.name ?? this.value()?.modelId ?? this.i18n.t('model.select'),
  );

  protected readonly groups = computed<Group[]>(() => {
    const q = this.query().trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const m of this.providers.allModels()) {
      if (!m.provider || (q && !`${m.model.name} ${m.model.id} ${m.provider.name}`.toLowerCase().includes(q))) continue;
      let g = map.get(m.provider.id);
      if (!g) {
        g = { providerId: m.provider.id, providerName: m.provider.name, configured: m.configured, models: [] };
        map.set(m.provider.id, g);
      }
      g.models.push(m);
    }
    // Proveedores configurados primero.
    return [...map.values()].sort((a, b) => Number(b.configured) - Number(a.configured));
  });

  private readonly flat = computed(() => this.groups().flatMap((g) => g.models));

  protected indexOf(m: AvailableModel): number {
    return this.flat().indexOf(m);
  }

  protected isSelected(m: AvailableModel): boolean {
    const v = this.value();
    return !!v && v.providerId === m.provider.id && v.modelId === m.model.id;
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.query.set('');
    const idx = this.flat().findIndex((m) => this.isSelected(m));
    this.active.set(Math.max(0, idx));
    this.open.set(true);
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  close(returnFocus = false): void {
    this.open.set(false);
    if (returnFocus) this.trigger()?.nativeElement.focus();
  }

  protected choose(m: AvailableModel): void {
    this.changed.emit({ providerId: m.provider.id, modelId: m.model.id });
    this.close(true);
  }

  protected onOutside(event: PointerEvent): void {
    if (!this.open()) return;
    const el = this.root()?.nativeElement;
    if (el && event.target instanceof Node && !el.contains(event.target)) this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const n = this.flat().length;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    } else if (event.key === 'ArrowDown' && n) {
      event.preventDefault();
      this.active.set((this.active() + 1) % n);
      this.scrollActive();
    } else if (event.key === 'ArrowUp' && n) {
      event.preventDefault();
      this.active.set((this.active() - 1 + n) % n);
      this.scrollActive();
    } else if (event.key === 'Enter') {
      const m = this.flat()[this.active()];
      if (m) {
        event.preventDefault();
        this.choose(m);
      }
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  private scrollActive(): void {
    const el = this.root()?.nativeElement.querySelector(`[data-idx="${this.active()}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }
}
