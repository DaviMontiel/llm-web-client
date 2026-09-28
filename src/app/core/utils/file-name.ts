const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Normaliza un nombre de archivo para descargas/guardado:
 * elimina separadores de ruta, caracteres de control y caracteres no válidos,
 * evita nombres reservados de Windows y limita la longitud.
 */
export function sanitizeFileName(input: string, fallback = 'archivo.txt'): string {
  const base = (input.split(/[\\/]/).pop() ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/^\.+/, '')
    .trim();
  if (!base) return fallback;
  const safe = RESERVED_WINDOWS.test(base) ? `_${base}` : base;
  return safe.length > 180 ? safe.slice(0, 180) : safe;
}

/**
 * Normaliza una ruta relativa de proyecto. Rechaza rutas absolutas y `..`
 * para impedir escapar de la carpeta del proyecto. Devuelve null si no es válida.
 */
export function normalizeRelativePath(input: string): string | null {
  const cleaned = input.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!cleaned || cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) return null;
  const parts = cleaned.split('/').filter((p) => p.length > 0 && p !== '.');
  if (parts.length === 0) return null;
  for (const part of parts) {
    // eslint-disable-next-line no-control-regex
    if (part === '..' || /[\u0000-\u001f<>:"|?*]/.test(part)) return null;
  }
  return parts.join('/');
}
