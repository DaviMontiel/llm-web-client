/** Detección de capacidades del navegador. Ninguna API opcional se asume. */
export const browserSupport = {
  directoryPicker(): boolean {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  },
  directoryUpload(): boolean {
    if (typeof document === 'undefined') return false;
    const input = document.createElement('input');
    return 'webkitdirectory' in input;
  },
  clipboardRead(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
  },
  clipboardWrite(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';
  },
  indexedDb(): boolean {
    return typeof indexedDB !== 'undefined';
  },
  streamingFetch(): boolean {
    return typeof ReadableStream !== 'undefined' && typeof Response !== 'undefined' && 'body' in Response.prototype;
  },
};

/** Abre el selector nativo de archivos y resuelve con la selección (o [] si se cancela). */
export function pickFiles(options: { accept?: string; multiple?: boolean; directory?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple ?? true;
    if (options.accept) input.accept = options.accept;
    if (options.directory) input.webkitdirectory = true;
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** Descarga un contenido como archivo (Blob + enlace temporal). */
export function downloadBlob(content: BlobPart, fileName: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (browserSupport.clipboardWrite()) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* sigue con el fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
