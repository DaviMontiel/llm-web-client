import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ChatStore } from '../../core/chat/chat-store.service';
import { SearchService } from '../../core/chat/search.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { Chat } from '../../core/models';
import { ProjectService } from '../../core/projects/project.service';
import { LayoutService } from '../../core/ui/layout.service';
import { MenuItem, MenuService } from '../../core/ui/menu.service';
import { DATE_GROUP_ORDER, DateGroup, dateGroupOf } from '../../core/utils/date-groups';
import { ChatActionsService } from '../../features/history/chat-actions.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';

type Row = { kind: 'header'; key: string; label: string } | { kind: 'chat'; key: string; chat: Chat };

const ROW_HEIGHT = 32;

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent, TPipe, ScrollingModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  protected readonly store = inject(ChatStore);
  protected readonly layout = inject(LayoutService);
  protected readonly projects = inject(ProjectService);
  private readonly search = inject(SearchService);
  private readonly menu = inject(MenuService);
  private readonly actions = inject(ChatActionsService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly query = signal('');
  protected readonly searching = signal(false);
  private readonly matches = signal<Set<string> | null>(null);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchToken = 0;

  protected readonly isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  protected readonly activeChat = computed(() => this.store.chat(this.store.activeChatId()));
  protected readonly activeProject = computed(() => this.projects.get(this.activeChat()?.projectId));

  protected readonly rows = computed<Row[]>(() => {
    const matches = this.matches();
    const filter = (c: Chat) => !matches || matches.has(c.id);
    const rows: Row[] = [];
    const temps = this.store.temporaryChats().filter(filter);
    const history = this.store.history().filter(filter);
    const favorites = history.filter((c) => c.favorite);
    if (favorites.length) {
      rows.push({ kind: 'header', key: 'h-fav', label: this.i18n.t('history.favorites') });
      for (const c of favorites) rows.push({ kind: 'chat', key: `f-${c.id}`, chat: c });
    }
    if (temps.length) {
      rows.push({ kind: 'header', key: 'h-temp', label: this.i18n.t('history.temporary') });
      for (const c of temps) rows.push({ kind: 'chat', key: c.id, chat: c });
    }
    const groups = new Map<DateGroup, Chat[]>();
    const now = Date.now();
    for (const c of history) {
      if (c.favorite) continue;
      const g = dateGroupOf(c.updatedAt, now);
      const list = groups.get(g);
      if (list) list.push(c);
      else groups.set(g, [c]);
    }
    for (const g of DATE_GROUP_ORDER) {
      const list = groups.get(g);
      if (!list?.length) continue;
      rows.push({ kind: 'header', key: `h-${g}`, label: this.i18n.t(`history.group.${g}`) });
      for (const c of list) rows.push({ kind: 'chat', key: c.id, chat: c });
    }
    return rows;
  });

  protected readonly hasChats = computed(() => this.store.history().length + this.store.temporaryChats().length > 0);

  constructor() {
    effect(() => {
      const q = this.query().trim();
      // Re-evaluar cuando cambian los chats para mantener el filtro coherente.
      this.store.chats();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      if (!q) {
        this.matches.set(null);
        this.searching.set(false);
        return;
      }
      this.searching.set(true);
      const token = ++this.searchToken;
      this.searchTimer = setTimeout(() => {
        void this.search.matchingChatIds(q).then((ids) => {
          if (token !== this.searchToken) return;
          this.matches.set(ids);
          this.searching.set(false);
        });
      }, 160);
    });
    inject(DestroyRef).onDestroy(() => this.searchTimer && clearTimeout(this.searchTimer));
  }

  protected trackRow = (_: number, row: Row) => row.key;

  protected title(chat: Chat): string {
    return this.actions.title(chat);
  }

  protected newChat(): void {
    void this.router.navigate(['/'], { queryParams: { new: Date.now() } });
    this.layout.closeDrawerOnMobile();
  }

  protected openChat(): void {
    this.layout.closeDrawerOnMobile();
  }

  protected openMenu(event: MouseEvent, chat: Chat): void {
    event.preventDefault();
    event.stopPropagation();
    this.menu.toggleAt(event.currentTarget as HTMLElement, this.actions.menuItems(chat), this.i18n.t('chat.actions'));
  }

  protected contextMenu(event: MouseEvent, chat: Chat): void {
    this.menu.openAtPointer(event, this.actions.menuItems(chat), this.i18n.t('chat.actions'));
  }

  protected projectMenu(event: MouseEvent): void {
    const chat = this.activeChat();
    const items: MenuItem[] = this.projects.sortedProjects().map((p) => ({
      id: p.id,
      label: p.name,
      icon: 'folder',
      checked: chat?.projectId === p.id,
      disabled: !chat,
      run: () => chat && this.store.setProject(chat.id, p.id),
    }));
    items.push({
      id: 'none',
      label: this.i18n.t('project.none'),
      icon: 'minus',
      checked: !!chat && !chat.projectId,
      disabled: !chat,
      separatorBefore: items.length > 0,
      run: () => chat && this.store.setProject(chat.id, null),
    });
    items.push({
      id: 'manage',
      label: this.i18n.t('project.manage'),
      icon: 'sliders-horizontal',
      separatorBefore: true,
      run: () => {
        void this.router.navigate(['/projects']);
        this.layout.closeDrawerOnMobile();
      },
    });
    this.menu.toggleAt(event.currentTarget as HTMLElement, items, this.i18n.t('project.select'), 'start');
  }

  protected clearQuery(input: HTMLInputElement): void {
    this.query.set('');
    input.focus();
  }
}
