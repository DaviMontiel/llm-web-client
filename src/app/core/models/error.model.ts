export type AppErrorCode =
  | 'not_configured'
  | 'auth'
  | 'network'
  | 'rate_limit'
  | 'bad_request'
  | 'server'
  | 'aborted'
  | 'unsupported'
  | 'permission'
  | 'not_found'
  | 'too_large'
  | 'invalid'
  | 'unknown';

/** Error serializable y apto para mostrar al usuario (sin stack traces). */
export interface AppErrorInfo {
  code: AppErrorCode;
  message: string;
  detail?: string;
  status?: number;
  retryable: boolean;
  /** `message` ya está traducido y es apto para mostrarse tal cual. */
  localized?: boolean;
}

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly options: { detail?: string; status?: number; retryable?: boolean; localized?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
  }

  toInfo(): AppErrorInfo {
    return {
      code: this.code,
      message: this.message,
      detail: this.options.detail,
      status: this.options.status,
      retryable: this.options.retryable ?? false,
      localized: this.options.localized,
    };
  }
}

export function toAppErrorInfo(error: unknown, fallbackMessage: string): AppErrorInfo {
  if (error instanceof AppError) return error.toInfo();
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'aborted', message: fallbackMessage, retryable: true };
  }
  return {
    code: 'unknown',
    message: fallbackMessage,
    detail: error instanceof Error ? error.message : undefined,
    retryable: true,
  };
}
