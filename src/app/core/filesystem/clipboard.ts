const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function pastedName(mime: string, index: number, now: Date): string {
  const ext = EXTENSION_BY_MIME[mime] ?? 'bin';
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  return `pegado-${stamp}${index > 0 ? `-${index + 1}` : ''}.${ext}`;
}

/** Los navegadores nombran "image.png" a toda imagen pegada: se renombra para distinguirlas. */
function renameGeneric(file: File, index: number, now: Date): File {
  const generic = /^image\.(png|jpe?g|gif|webp)$/i.test(file.name) || !file.name;
  if (!generic) return file;
  return new File([file], pastedName(file.type, index, now), { type: file.type, lastModified: now.getTime() });
}

export interface ClipboardExtraction {
  files: File[];
  /** true si el evento debe cancelarse (se han consumido archivos y no hay texto). */
  consume: boolean;
}

/**
 * Decide qué hacer con un evento `paste`:
 * - Si hay archivos y NO hay texto plano → se adjuntan y se cancela el pegado.
 * - Si hay texto plano (p. ej. copiar de Word/Excel, que añade también una
 *   imagen de la selección) → se deja el pegado normal de texto.
 */
export function extractClipboardFiles(data: DataTransfer | null, now = new Date()): ClipboardExtraction {
  if (!data) return { files: [], consume: false };
  const files: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  if (files.length === 0 && data.files?.length) files.push(...Array.from(data.files));
  if (files.length === 0) return { files: [], consume: false };
  const text = data.getData('text/plain');
  if (text && text.trim().length > 0) return { files: [], consume: false };
  return { files: files.map((f, i) => renameGeneric(f, i, now)), consume: true };
}

/** Lee imágenes del portapapeles con la Async Clipboard API (`ClipboardItem`). */
export async function readClipboardImages(now = new Date()): Promise<File[]> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') return [];
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    files.push(new File([blob], pastedName(type, files.length, now), { type, lastModified: now.getTime() }));
  }
  return files;
}

/** Tipos de un drag: ¿contiene archivos? */
export function dragHasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return !!types && Array.from(types).includes('Files');
}
