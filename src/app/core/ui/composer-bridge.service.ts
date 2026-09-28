import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AttachmentSource, PendingAttachment } from '../models';

export interface IncomingFiles {
  files: File[];
  source: AttachmentSource;
  paths?: string[];
}

/**
 * Canal entre elementos globales (overlay de drag & drop, explorador de
 * proyecto, sugerencias) y el composer activo.
 */
@Injectable({ providedIn: 'root' })
export class ComposerBridgeService {
  readonly files$ = new Subject<IncomingFiles>();
  readonly insertText$ = new Subject<string>();
  readonly focus$ = new Subject<void>();
  /** Adjuntos pendientes del composer activo (para el panel de contexto). */
  readonly pending = signal<PendingAttachment[]>([]);
  /** Petición de quitar un adjunto pendiente desde fuera del composer. */
  readonly removePending$ = new Subject<string>();
  private readonly mounted = signal(0);
  /** Hay un composer montado que puede recibir archivos. */
  readonly available = computed(() => this.mounted() > 0);

  register(): () => void {
    this.mounted.update((n) => n + 1);
    return () => this.mounted.update((n) => Math.max(0, n - 1));
  }

  addFiles(files: File[], source: AttachmentSource, paths?: string[]): void {
    if (files.length) this.files$.next({ files, source, paths });
  }

  insertText(text: string): void {
    this.insertText$.next(text);
  }

  focus(): void {
    this.focus$.next();
  }
}
