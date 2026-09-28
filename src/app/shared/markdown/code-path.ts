import { normalizeRelativePath } from '../../core/utils/file-name';

/**
 * Intenta deducir la ruta de archivo de un bloque de código:
 * - Info string: ```ts src/app/app.ts   ·   ```ts:src/app.ts   ·   ```ts title="src/app.ts"
 * - Primera línea de comentario: // src/app.ts · # file: main.py · <!-- index.html -->
 */
export function detectCodePath(info: string, code: string): string | null {
  const candidates: string[] = [];
  const title = /(?:title|file|filename|path)=["']?([^"'\s]+)["']?/i.exec(info);
  if (title) candidates.push(title[1]);
  const colon = /^[\w+#-]+:(\S+)$/.exec(info.trim());
  if (colon) candidates.push(colon[1]);
  const parts = info.trim().split(/\s+/);
  if (parts.length > 1 && !parts[1].includes('=')) candidates.push(parts[1]);

  const firstLine = code.split('\n', 1)[0]?.trim() ?? '';
  const comment =
    /^(?:\/\/|#|--|\/\*|<!--)\s*(?:(?:file|filename|path|archivo)\s*:\s*)?([\w@./-]+\.[\w]+)\s*(?:\*\/|-->)?$/i.exec(
      firstLine,
    );
  if (comment) candidates.push(comment[1]);

  for (const c of candidates) {
    const normalized = normalizeRelativePath(c);
    if (normalized && /\.[A-Za-z0-9]+$/.test(normalized)) return normalized;
  }
  return null;
}
