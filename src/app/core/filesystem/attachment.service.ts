import { Injectable, inject } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { AppError, Attachment, AttachmentSource } from '../models';
import { SettingsService } from '../settings/settings.service';
import { IMAGE_MIME_TYPES, isKnownBinaryName, isKnownTextName, looksBinary, mimeFromName } from '../utils/binary';
import { sanitizeFileName } from '../utils/file-name';
import { fileExtension, formatBytes } from '../utils/format';
import { createId } from '../utils/id';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read error'));
    reader.readAsArrayBuffer(blob);
  });
}

async function imageDimensions(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      const dims = { width: bmp.width, height: bmp.height };
      bmp.close();
      return dims;
    }
  } catch {
    /* formato no decodificable */
  }
  return null;
}

export interface ProcessOptions {
  source: AttachmentSource;
  path?: string;
}

/**
 * Convierte `File` en `Attachment` validando tamaño, extensión y tipo de
 * contenido. El contenido binario nunca se interpreta como texto.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly settings = inject(SettingsService);
  private readonly i18n = inject(I18nService);

  /** Valida sin leer el archivo. Lanza AppError con mensaje comprensible. */
  validate(file: Pick<File, 'name' | 'size'>): void {
    const s = this.settings.settings();
    const maxBytes = s.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppError(
        'too_large',
        this.i18n.t('error.fileTooLarge', { name: file.name, max: formatBytes(maxBytes) }),
      );
    }
    const ext = fileExtension(file.name);
    if (s.allowedExtensions.length > 0 && !s.allowedExtensions.includes(ext)) {
      throw new AppError('invalid', this.i18n.t('error.extensionNotAllowed', { name: file.name, ext: ext || '—' }));
    }
  }

  async process(file: File, options: ProcessOptions): Promise<Attachment> {
    this.validate(file);
    const name = sanitizeFileName(file.name, 'archivo');
    const mimeType = file.type || mimeFromName(name);
    const base: Attachment = {
      id: createId(),
      name,
      path: options.path,
      mimeType,
      size: file.size,
      kind: 'binary',
      source: options.source,
      lastModified: file.lastModified,
    };

    try {
      if (IMAGE_MIME_TYPES.has(mimeType)) {
        const buffer = await readBytes(file);
        const dims = await imageDimensions(file);
        return {
          ...base,
          kind: 'image',
          dataBase64: arrayBufferToBase64(buffer),
          width: dims?.width,
          height: dims?.height,
        };
      }
      if (isKnownBinaryName(name) && !isKnownTextName(name)) return base;

      const head = new Uint8Array(await readBytes(file.slice(0, 8192)));
      if (looksBinary(head)) return base;

      const maxChars = this.settings.settings().maxContextKB * 1024;
      const text = new TextDecoder('utf-8', { fatal: false }).decode(await readBytes(file));
      const truncated = text.length > maxChars;
      return {
        ...base,
        kind: 'text',
        mimeType: mimeType || 'text/plain',
        textContent: truncated ? text.slice(0, maxChars) : text,
        truncated,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('invalid', this.i18n.t('error.fileRead', { name }));
    }
  }

  /** Data URL para previsualizar una imagen adjunta. */
  static previewUrl(attachment: Attachment): string | null {
    return attachment.kind === 'image' && attachment.dataBase64
      ? `data:${attachment.mimeType};base64,${attachment.dataBase64}`
      : null;
  }
}
