import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SearchResult, SearchService } from '../../core/chat/search.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { LayoutService } from '../../core/ui/layout.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { IconName } from '../../shared/components/icon/icons';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ShortDatePipe } from '../../shared/pipes/format.pipes';

interface Part {
  text: string;
  hit: boolean;
}

/** Divide un texto en fragmentos marcando coincidencias (sin innerHTML). */
export function highlightParts(text: string, query: string): Part[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const parts: Part[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx < 0) {
      parts.push({ text: text.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ text: text.slice(i, idx), hit: false });
    parts.push({ text: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return parts;
}

/** Búsqueda global (Ctrl/Cmd + K) en chats, mensajes y proyectos. */
@Component({
  selector: 'app-search-dialog',
  imports: [ModalComponent, IconComponent, TPipe, EmptyStateComponent, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal
      [open]="layout.searchOpen()"
      size="lg"
      [flush]="true"
      [ariaLabel]="'search.title' | t"
      (closed)="close()"
    >
      <div class="search">
        <div class="input-row">
          <app-icon name="search" [size]="17" />
          <input
            #input
            class="q"
            type="text"
            [value]="query()"
            (input)="query.set(input.value)"
            (keydown)="onKeydown($event)"
            [placeholder]="'search.placeholder' | t"
            [attr.aria-label]="'search.placeholder' | t"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="search-results"
            [attr.aria-activedescendant]="results().length ? 'sr-' + selected() : null"
            aria-expanded="true"
            autocomplete="off"
            spellcheck="false"
            cdkFocusInitial
          />
          <kbd>Esc</kbd>
        </div>
        <div class="results" id="search-results" role="listbox" [attr.aria-label]="'search.results' | t">
          @if (loading()) {
            <div class="loading">
              @for (i of [1, 2, 3]; track i) {
                <div class="skeleton sk"></div>
              }
            </div>
          } @else if (!query().trim()) {
            <p class="hint">{{ 'search.hint' | t }}</p>
          } @else if (results().length === 0) {
            <app-empty-state
              icon="search"
              [title]="'search.empty' | t"
              [description]="'search.emptyHint' | t"
              [compact]="true"
            />
          } @else {
            @for (r of results(); track r.kind + r.id; let i = $index) {
              @if (i === 0 || results()[i - 1].kind !== r.kind) {
                <div class="group" role="presentation">{{ groupLabel(r.kind) | t }}</div>
              }
              <button
                type="button"
                class="result"
                [id]="'sr-' + i"
                role="option"
                [attr.aria-selected]="i === selected()"
                [class.is-selected]="i === selected()"
                (click)="open(r)"
                (mousemove)="selected.set(i)"
              >
                <app-icon [name]="icon(r)" [size]="15" class="r-icon" />
                <span class="r-main">
                  <span class="r-title">
                    @for (p of parts(r.title); track $index) {
                      @if (p.hit) {
                        <mark>{{ p.text }}</mark>
                      } @else {
                        <span>{{ p.text }}</span>
                      }
                    }
                  </span>
                  @if (r.snippet) {
                    <span class="r-snippet">
                      @for (p of parts(r.snippet); track $index) {
                        @if (p.hit) {
                          <mark>{{ p.text }}</mark>
                        } @else {
                          <span>{{ p.text }}</span>
                        }
                      }
                    </span>
                  }
                </span>
                <span class="r-date">{{ r.timestamp | shortDate }}</span>
              </button>
            }
          }
        </div>
      </div>
    </app-modal>
  `,
  styles: `
    .input-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
    }
    .q {
      flex: 1;
      border: none;
      background: none;
      font-size: 15px;
      color: var(--foreground);
      outline: none;
    }
    .q::placeholder {
      color: var(--subtle);
    }
    .results {
      max-height: min(56vh, 520px);
      overflow-y: auto;
      padding: 6px;
    }
    .hint {
      padding: 24px 16px;
      text-align: center;
      font-size: 13px;
      color: var(--muted);
    }
    .group {
      padding: 10px 10px 4px;
      font-size: 11.5px;
      font-weight: 500;
      color: var(--subtle);
    }
    .result {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      border: none;
      border-radius: var(--radius-sm);
      background: none;
      text-align: left;
      color: var(--foreground);
    }
    .result.is-selected {
      background: var(--surface-hover);
    }
    .r-icon {
      margin-top: 2px;
      color: var(--muted);
    }
    .r-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .r-title {
      font-size: 13.5px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .r-snippet {
      font-size: 12.5px;
      color: var(--muted);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .r-date {
      font-size: 11.5px;
      color: var(--subtle);
      white-space: nowrap;
      margin-top: 2px;
    }
    mark {
      background: var(--accent-soft);
      color: inherit;
      border-radius: 3px;
      padding: 0 1px;
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
    }
    .sk {
      height: 34px;
    }
  `,
})
export class SearchDialogComponent {
  protected readonly layout = inject(LayoutService);
  private readonly search = inject(SearchService);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  protected readonly results = signal<SearchResult[]>([]);
  protected readonly loading = signal(false);
  protected readonly selected = signal(0);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;
  protected readonly lastQuery = computed(() => this.query().trim());

  constructor() {
    effect(() => {
      const q = this.lastQuery();
      const open = this.layout.searchOpen();
      if (this.timer) clearTimeout(this.timer);
      if (!open || !q) {
        this.results.set([]);
        this.loading.set(false);
        return;
      }
      this.loading.set(this.results().length === 0);
      const token = ++this.token;
      this.timer = setTimeout(() => {
        void this.search.search(q).then((r) => {
          if (token !== this.token) return;
          this.results.set(r);
          this.selected.set(0);
          this.loading.set(false);
        });
      }, 120);
    });
    effect(() => {
      if (!this.layout.searchOpen()) this.query.set('');
    });
  }

  protected parts(text: string): Part[] {
    return highlightParts(text, this.query());
  }

  protected groupLabel(
    kind: SearchResult['kind'],
  ): 'search.group.chats' | 'search.group.messages' | 'search.group.projects' {
    return kind === 'chat'
      ? 'search.group.chats'
      : kind === 'message'
        ? 'search.group.messages'
        : 'search.group.projects';
  }

  protected icon(r: SearchResult): IconName {
    return r.kind === 'project' ? 'folder' : r.kind === 'chat' ? 'message-square' : 'file-text';
  }

  protected onKeydown(event: KeyboardEvent): void {
    const n = this.results().length;
    if (event.key === 'ArrowDown' && n) {
      event.preventDefault();
      this.selected.set((this.selected() + 1) % n);
      this.scrollSelected();
    } else if (event.key === 'ArrowUp' && n) {
      event.preventDefault();
      this.selected.set((this.selected() - 1 + n) % n);
      this.scrollSelected();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const r = this.results()[this.selected()];
      if (r) this.open(r);
    }
  }

  private scrollSelected(): void {
    setTimeout(() => document.getElementById(`sr-${this.selected()}`)?.scrollIntoView({ block: 'nearest' }));
  }

  protected open(r: SearchResult): void {
    this.close();
    if (r.kind === 'project') void this.router.navigate(['/projects', r.id]);
    else if (r.kind === 'message') void this.router.navigate(['/chat', r.chatId], { queryParams: { m: r.messageId } });
    else void this.router.navigate(['/chat', r.chatId]);
  }

  protected close(): void {
    this.layout.searchOpen.set(false);
  }
}
