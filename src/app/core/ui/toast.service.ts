import { Injectable, signal } from '@angular/core';
import { createId } from '../utils/id';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  detail?: string;
  action?: ToastAction;
}

/** Notificaciones discretas. Máximo 3 visibles; se descartan solas. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  show(
    kind: ToastKind,
    message: string,
    options: { detail?: string; action?: ToastAction; duration?: number } = {},
  ): string {
    const id = createId();
    const toast: Toast = { id, kind, message, detail: options.detail, action: options.action };
    this.toasts.update((list) => [...list.filter((t) => t.message !== message).slice(-2), toast]);
    const duration = options.duration ?? (kind === 'error' ? 6000 : 2800);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), duration),
    );
    return id;
  }

  success(message: string, options?: { detail?: string; action?: ToastAction }): string {
    return this.show('success', message, options);
  }
  error(message: string, options?: { detail?: string; action?: ToastAction }): string {
    return this.show('error', message, options);
  }
  info(message: string, options?: { detail?: string; action?: ToastAction }): string {
    return this.show('info', message, options);
  }
  warning(message: string, options?: { detail?: string; action?: ToastAction }): string {
    return this.show('warning', message, options);
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
