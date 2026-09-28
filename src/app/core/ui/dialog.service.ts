import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  maxLength?: number;
}

export type DialogRequest =
  | { type: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

/** Diálogos de confirmación y de entrada de texto basados en promesas. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogRequest | null>(null);

  confirm(options: ConfirmOptions): Promise<boolean> {
    this.cancelCurrent();
    return new Promise((resolve) => this.current.set({ type: 'confirm', options, resolve }));
  }

  prompt(options: PromptOptions): Promise<string | null> {
    this.cancelCurrent();
    return new Promise((resolve) => this.current.set({ type: 'prompt', options, resolve }));
  }

  close(result: boolean | string | null): void {
    const req = this.current();
    if (!req) return;
    this.current.set(null);
    if (req.type === 'confirm') req.resolve(result === true);
    else req.resolve(typeof result === 'string' ? result : null);
  }

  private cancelCurrent(): void {
    const req = this.current();
    if (!req) return;
    if (req.type === 'confirm') req.resolve(false);
    else req.resolve(null);
    this.current.set(null);
  }
}
