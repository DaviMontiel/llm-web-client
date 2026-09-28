import { Injectable, signal } from '@angular/core';

export interface ApplyChangesRequest {
  projectId: string;
  path: string;
  content: string;
}

/** Estado del diálogo "Aplicar a archivo" (nunca se escribe sin confirmación). */
@Injectable({ providedIn: 'root' })
export class CodeActionsService {
  readonly applyRequest = signal<ApplyChangesRequest | null>(null);
  /** Proyecto del chat visible (lo fija la página de chat). */
  readonly activeProjectId = signal<string | null>(null);

  requestApply(request: ApplyChangesRequest): void {
    this.applyRequest.set(request);
  }

  close(): void {
    this.applyRequest.set(null);
  }
}
