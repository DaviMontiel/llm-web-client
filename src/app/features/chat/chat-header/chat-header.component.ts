import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ChatStore } from '../../../core/chat/chat-store.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { Chat, ModelRef } from '../../../core/models';
import { ProjectService } from '../../../core/projects/project.service';
import { LayoutService } from '../../../core/ui/layout.service';
import { MenuService } from '../../../core/ui/menu.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ChatActionsService } from '../../history/chat-actions.service';
import { ModelPickerComponent } from '../model-picker/model-picker.component';

@Component({
  selector: 'app-chat-header',
  imports: [IconComponent, TPipe, ModelPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="left">
        @if (!layout.sidebarOpen() || layout.isMobile()) {
          <button
            type="button"
            class="icon-btn"
            (click)="layout.toggleSidebar()"
            [attr.aria-label]="'sidebar.open' | t"
            [title]="'sidebar.open' | t"
          >
            <app-icon [name]="layout.isMobile() ? 'menu' : 'panel-left'" />
          </button>
        }
        <app-model-picker [value]="model()" (changed)="modelChange.emit($event)" />
        @if (chat().temporary) {
          <span class="badge badge-accent temp" [title]="'chat.temporaryHint' | t">
            <app-icon name="message-square-dashed" [size]="12" /> {{ 'chat.temporary' | t }}
          </span>
        }
      </div>

      <div class="center">
        @if (hasMessages()) {
          <button type="button" class="title" (click)="actions.rename(chat())" [title]="'chat.rename' | t">
            {{ actions.title(chat()) }}
          </button>
        }
      </div>

      <div class="right">
        @if (project(); as p) {
          <button
            type="button"
            class="working"
            (click)="layout.toggleRightPanel('files')"
            [title]="'chat.workingIn' | t: { name: p.rootName ?? p.name }"
          >
            <span class="working-label">{{ 'chat.workingInLabel' | t }}</span>
            <app-icon name="folder" [size]="13" />
            <span class="working-name">{{ p.rootName ?? p.name }}</span>
          </button>
        }
        <button
          type="button"
          class="icon-btn ctx-btn"
          [class.is-active]="layout.rightPanel() === 'context'"
          (click)="layout.toggleRightPanel('context')"
          [attr.aria-label]="'context.panel' | t"
          [title]="'context.panel' | t"
          [attr.aria-pressed]="layout.rightPanel() === 'context'"
        >
          <app-icon name="layers" [size]="16" />
          @if (contextCount() > 0) {
            <span class="dot">{{ contextCount() }}</span>
          }
        </button>
        <button
          type="button"
          class="icon-btn hide-mobile"
          [class.is-active]="layout.rightPanel() === 'files'"
          (click)="layout.toggleRightPanel('files')"
          [attr.aria-label]="'context.filesTab' | t"
          [title]="'context.filesTab' | t"
          [attr.aria-pressed]="layout.rightPanel() === 'files'"
        >
          <app-icon name="folder-tree" [size]="16" />
        </button>
        <button
          type="button"
          class="icon-btn"
          (click)="openMenu($event)"
          [attr.aria-label]="'chat.actions' | t"
          aria-haspopup="menu"
        >
          <app-icon name="ellipsis" [size]="16" />
        </button>
      </div>
    </header>
  `,
  styles: `
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      height: var(--header-height);
      padding: 0 10px;
      flex-shrink: 0;
    }
    .left,
    .right {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .right {
      justify-content: flex-end;
    }
    .center {
      min-width: 0;
      display: flex;
      justify-content: center;
    }
    .title {
      max-width: 340px;
      padding: 4px 10px;
      border: none;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--muted);
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .title:hover {
      background: var(--surface-hover);
      color: var(--foreground);
    }
    .temp {
      margin-left: 4px;
    }
    .working {
      white-space: nowrap;
      flex-shrink: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      max-width: 240px;
      height: 28px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      font-size: 12px;
      color: var(--muted);
      margin-right: 4px;
    }
    .working:hover {
      border-color: var(--border-strong);
      color: var(--foreground);
    }
    .working app-icon {
      color: var(--accent);
    }
    .working-name {
      font-family: var(--font-mono);
      color: var(--foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ctx-btn {
      position: relative;
    }
    .dot {
      position: absolute;
      top: 1px;
      right: 0;
      min-width: 15px;
      height: 15px;
      padding: 0 4px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-foreground);
      font-size: 10px;
      font-weight: 600;
      line-height: 15px;
    }
    @media (max-width: 900px) {
      .center {
        display: none;
      }
      .header {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .working-label {
        display: none;
      }
    }
    @media (max-width: 640px) {
      .hide-mobile,
      .working {
        display: none;
      }
    }
  `,
})
export class ChatHeaderComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly actions = inject(ChatActionsService);
  private readonly store = inject(ChatStore);
  private readonly projects = inject(ProjectService);
  private readonly menu = inject(MenuService);
  private readonly i18n = inject(I18nService);

  readonly chat = input.required<Chat>();
  readonly model = input<ModelRef | null>(null);
  readonly modelChange = output<ModelRef>();

  protected readonly project = computed(() => this.projects.get(this.chat().projectId));
  protected readonly hasMessages = computed(() => this.chat().activeLeafId !== null);
  protected readonly contextCount = computed(() => this.chat().context.files.length);

  protected openMenu(event: MouseEvent): void {
    const chat = this.store.chat(this.chat().id) ?? this.chat();
    this.menu.toggleAt(event.currentTarget as HTMLElement, this.actions.menuItems(chat), this.i18n.t('chat.actions'));
  }
}
