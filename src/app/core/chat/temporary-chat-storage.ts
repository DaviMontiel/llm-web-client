import { Chat, Message } from '../models';

const KEY = 'lwc.temporary-chats';

interface TemporarySnapshot {
  chats: Chat[];
  messages: Message[];
}

/**
 * Los chats temporales nunca se escriben en IndexedDB. Se guardan (mejor
 * esfuerzo) en sessionStorage: sobreviven a una recarga de la pestaña,
 * pero desaparecen al cerrarla. Si no caben (cuota ~5 MB), se omiten las
 * imágenes y, en último caso, solo viven en memoria.
 */
export class TemporaryChatStorage {
  private timer: ReturnType<typeof setTimeout> | null = null;

  load(): TemporarySnapshot {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return { chats: [], messages: [] };
      const parsed = JSON.parse(raw) as Partial<TemporarySnapshot>;
      return {
        chats: Array.isArray(parsed.chats) ? parsed.chats.filter((c) => c && typeof c.id === 'string') : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages.filter((m) => m && typeof m.id === 'string') : [],
      };
    } catch {
      return { chats: [], messages: [] };
    }
  }

  schedule(getSnapshot: () => TemporarySnapshot): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.write(getSnapshot()), 400);
  }

  write(snapshot: TemporarySnapshot): void {
    try {
      if (snapshot.chats.length === 0) {
        sessionStorage.removeItem(KEY);
        return;
      }
      try {
        sessionStorage.setItem(KEY, JSON.stringify(snapshot));
      } catch {
        const light = {
          chats: snapshot.chats,
          messages: snapshot.messages.map((m) => ({
            ...m,
            attachments: m.attachments.map((a) => (a.kind === 'image' ? { ...a, dataBase64: undefined } : a)),
          })),
        };
        sessionStorage.setItem(KEY, JSON.stringify(light));
      }
    } catch {
      /* sessionStorage lleno o no disponible: solo memoria. */
    }
  }
}
