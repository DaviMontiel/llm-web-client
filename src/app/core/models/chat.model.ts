import { Attachment } from './attachment.model';
import { AppErrorInfo } from './error.model';
import { ModelRef, TokenUsage } from './llm.model';

export type MessageRole = 'user' | 'assistant';

/**
 * - `streaming`: generación en curso.
 * - `stopped`: detenida por el usuario (se conserva la respuesta parcial).
 * - `interrupted`: la app se cerró durante la generación.
 * - `error`: la petición falló.
 */
export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'interrupted' | 'error';

/** Resumen de qué contexto se envió con un mensaje (transparencia para el usuario). */
export interface ContextSummary {
  files: { path: string; bytes: number }[];
  instructions: boolean;
  totalBytes: number;
}

/**
 * Los mensajes forman un árbol mediante `parentId`: editar o regenerar crea
 * hermanos (ramas) en lugar de destruir el historial.
 */
export interface Message {
  id: string;
  chatId: string;
  parentId: string | null;
  role: MessageRole;
  content: string;
  attachments: Attachment[];
  createdAt: number;
  updatedAt: number;
  status: MessageStatus;
  model?: ModelRef;
  modelName?: string;
  error?: AppErrorInfo;
  usage?: TokenUsage;
  context?: ContextSummary;
}

/** Selección de contexto de proyecto asociada a un chat. */
export interface ChatContextSelection {
  /** Rutas relativas de archivos del proyecto incluidos en el contexto. */
  files: string[];
  includeInstructions: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  projectId: string | null;
  model: ModelRef | null;
  temporary: boolean;
  favorite: boolean;
  /** Hoja activa del árbol de mensajes: define la rama visible. */
  activeLeafId: string | null;
  /** El usuario renombró el chat manualmente. */
  titleLocked: boolean;
  context: ChatContextSelection;
  /** Métricas reales del último uso informado por el proveedor. */
  lastUsage?: TokenUsage;
}

/** Vista de conversación: la rama activa resuelta. */
export interface Conversation {
  chat: Chat;
  messages: Message[];
}

export const EMPTY_CONTEXT: ChatContextSelection = { files: [], includeInstructions: true };
