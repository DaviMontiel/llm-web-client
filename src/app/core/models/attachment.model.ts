/** Categoría de contenido de un adjunto. Determina cómo se procesa y se envía. */
export type AttachmentKind = 'image' | 'text' | 'binary';

/** Origen del adjunto (útil para UX y depuración). */
export type AttachmentSource = 'upload' | 'paste' | 'drop' | 'folder' | 'project';

/**
 * Adjunto ya procesado y listo para formar parte de un mensaje.
 * - `text`: se incluye su contenido textual (`textContent`).
 * - `image`: se incluye como base64 (`dataBase64`) si el modelo admite visión.
 * - `binary`: solo metadatos; nunca se interpreta como texto.
 */
export interface Attachment {
  id: string;
  name: string;
  /** Ruta relativa (carpetas / proyecto). Nunca una ruta absoluta del sistema. */
  path?: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  source: AttachmentSource;
  lastModified?: number;
  textContent?: string;
  /** Base64 sin prefijo `data:`. */
  dataBase64?: string;
  width?: number;
  height?: number;
  /** El contenido textual se truncó por superar el límite configurado. */
  truncated?: boolean;
}

export type PendingAttachmentStatus = 'processing' | 'ready' | 'error';

/** Adjunto en el composer, antes de enviarse. */
export interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  status: PendingAttachmentStatus;
  error?: string;
  attachment?: Attachment;
}

/** Referencia a un archivo dentro de un proyecto. */
export interface FileReference {
  projectId: string;
  /** Ruta relativa a la raíz del proyecto, con `/` como separador. */
  path: string;
  name: string;
  size?: number;
  lastModified?: number;
}
