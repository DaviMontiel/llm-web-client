import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ChatStore } from '../../core/chat/chat-store.service';
import { ExportImportService } from '../../core/data/export-import.service';
import { downloadBlob } from '../../core/filesystem/fs-support';
import { I18nService } from '../../core/i18n/i18n.service';
import { Chat } from '../../core/models';
import { DialogService } from '../../core/ui/dialog.service';
import { MenuItem } from '../../core/ui/menu.service';
import { ToastService } from '../../core/ui/toast.service';
import { sanitizeFileName } from '../../core/utils/file-name';

/** Acciones sobre chats compartidas por el sidebar y la cabecera del chat. */
@Injectable({ providedIn: 'root' })
export class ChatActionsService {
  private readonly store = inject(ChatStore);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly exporter = inject(ExportImportService);

  title(chat: Chat): string {
    return chat.title || this.i18n.t('chat.untitled');
  }

  menuItems(chat: Chat): MenuItem[] {
    const t = (k: Parameters<I18nService['t']>[0]) => this.i18n.t(k);
    return [
      { id: 'rename', label: t('chat.rename'), icon: 'pencil', run: () => void this.rename(chat) },
      {
        id: 'favorite',
        label: chat.favorite ? t('chat.unfavorite') : t('chat.favorite'),
        icon: 'star',
        run: () => this.store.toggleFavorite(chat.id),
      },
      { id: 'duplicate', label: t('chat.duplicate'), icon: 'copy', run: () => void this.duplicate(chat) },
      { id: 'export', label: t('chat.exportMarkdown'), icon: 'download', run: () => void this.exportMarkdown(chat) },
      {
        id: 'temporary',
        label: chat.temporary ? t('chat.makePermanent') : t('chat.makeTemporary'),
        icon: chat.temporary ? 'save' : 'message-square-dashed',
        run: () => void this.toggleTemporary(chat),
      },
      {
        id: 'delete',
        label: t('chat.delete'),
        icon: 'trash',
        danger: true,
        separatorBefore: true,
        run: () => void this.delete(chat),
      },
    ];
  }

  async rename(chat: Chat): Promise<void> {
    const value = await this.dialogs.prompt({
      title: this.i18n.t('chat.renameTitle'),
      label: this.i18n.t('chat.renameLabel'),
      value: chat.title,
      confirmLabel: this.i18n.t('common.save'),
      maxLength: 120,
    });
    if (value !== null) this.store.rename(chat.id, value);
  }

  async duplicate(chat: Chat): Promise<void> {
    const copy = await this.store.duplicateChat(chat.id);
    if (copy) {
      this.toast.success(this.i18n.t('toast.chatDuplicated'));
      void this.router.navigate(['/chat', copy.id]);
    }
  }

  async exportMarkdown(chat: Chat): Promise<void> {
    const md = await this.exporter.chatToMarkdown(chat.id);
    downloadBlob(md, sanitizeFileName(`${this.title(chat)}.md`, 'chat.md'), 'text/markdown;charset=utf-8');
  }

  async toggleTemporary(chat: Chat): Promise<void> {
    if (!chat.temporary) {
      const ok = await this.dialogs.confirm({
        title: this.i18n.t('chat.makeTemporaryTitle'),
        message: this.i18n.t('chat.makeTemporaryMessage'),
        confirmLabel: this.i18n.t('chat.makeTemporary'),
      });
      if (!ok) return;
    }
    await this.store.setTemporary(chat.id, !chat.temporary);
    this.toast.success(this.i18n.t(chat.temporary ? 'toast.chatSaved' : 'toast.chatTemporary'));
  }

  async delete(chat: Chat): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('chat.deleteTitle'),
      message: this.i18n.t('chat.deleteMessage', { title: this.title(chat) }),
      confirmLabel: this.i18n.t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    const wasActive = this.store.activeChatId() === chat.id;
    await this.store.deleteChat(chat.id);
    this.toast.success(this.i18n.t('toast.chatDeleted'));
    if (wasActive) void this.router.navigate(['/']);
  }
}
