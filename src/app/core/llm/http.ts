import { Observable } from 'rxjs';
import { AppError } from '../models';

/** Extrae un mensaje de error legible de un cuerpo JSON típico de proveedor. */
export function extractProviderMessage(body: string): string | undefined {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const err = json['error'];
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const msg = (err as Record<string, unknown>)['message'];
      if (typeof msg === 'string') return msg;
    }
    const msg = json['message'];
    if (typeof msg === 'string') return msg;
  } catch {
    /* no es JSON */
  }
  const trimmed = body.trim();
  return trimmed ? trimmed.slice(0, 300) : undefined;
}

export function errorFromStatus(status: number, detail?: string): AppError {
  const d = detail?.slice(0, 500);
  if (status === 401 || status === 403) return new AppError('auth', 'Authentication failed', { status, detail: d });
  if (status === 404) return new AppError('not_found', 'Resource not found', { status, detail: d });
  if (status === 429) return new AppError('rate_limit', 'Rate limited', { status, detail: d, retryable: true });
  if (status === 400 || status === 413 || status === 422)
    return new AppError('bad_request', 'Bad request', { status, detail: d });
  if (status >= 500) return new AppError('server', 'Provider error', { status, detail: d, retryable: true });
  return new AppError('unknown', 'Unexpected response', { status, detail: d, retryable: true });
}

/**
 * fetch con mapeo homogéneo de errores. Un `TypeError` de fetch suele indicar
 * red caída o bloqueo CORS: el navegador no permite distinguirlos.
 */
export async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AppError('network', 'Network or CORS error', {
      detail: error instanceof Error ? error.message : undefined,
      retryable: true,
    });
  }
  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* ignorar */
    }
    throw errorFromStatus(response.status, extractProviderMessage(body));
  }
  return response;
}

/**
 * Crea un Observable a partir de una función asíncrona que recibe un
 * AbortSignal. Al cancelar la suscripción se aborta la petición.
 */
export function abortableObservable<T>(
  run: (signal: AbortSignal, emit: (value: T) => void) => Promise<void>,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    run(controller.signal, (v) => subscriber.next(v))
      .then(() => subscriber.complete())
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          subscriber.complete();
          return;
        }
        subscriber.error(error);
      });
    return () => controller.abort();
  });
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
