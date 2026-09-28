import { Marked, Token, Tokens, TokensList } from 'marked';
import { escapeHtml, highlightCode } from './highlight';

export type MarkdownSegment =
  | { kind: 'html'; key: string; html: string }
  | { kind: 'code'; key: string; code: string; lang: string; closed: boolean };

const SAFE_PROTOCOLS = /^(https?:|mailto:)/i;

/** Solo se permiten enlaces http(s), mailto y anclas relativas; nunca `javascript:` ni `data:`. */
export function safeUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  // eslint-disable-next-line no-control-regex
  const normalized = trimmed.replace(/[\u0000-\u001f\s]/g, '');
  if (SAFE_PROTOCOLS.test(normalized)) return trimmed;
  if (normalized.startsWith('#')) return trimmed;
  return null;
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

/**
 * Instancia de marked con un renderer endurecido:
 * - El HTML crudo del modelo se muestra como texto (nunca se interpreta).
 * - Enlaces solo con protocolos seguros, abiertos en pestaña nueva con `noopener`.
 * - Las imágenes remotas no se cargan (evita tracking): se muestran como enlace.
 * El resultado pasa además por el sanitizador de Angular al enlazarse con [innerHTML].
 */
const md = new Marked({ gfm: true, breaks: false, async: false });
md.use({
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag): string {
      const escaped = escapeHtml(token.text);
      return 'block' in token && token.block ? `<p class="md-raw">${escaped.trim()}</p>` : escaped;
    },
    link(token: Tokens.Link): string {
      const inner = this.parser.parseInline(token.tokens);
      const href = safeUrl(token.href);
      if (!href) return inner;
      const title = token.title ? ` title="${escapeAttr(token.title)}"` : '';
      return `<a href="${escapeAttr(href)}"${title} target="_blank" rel="noopener noreferrer nofollow">${inner}</a>`;
    },
    image({ href, text }: Tokens.Image): string {
      const url = safeUrl(href);
      const label = escapeHtml(text || href || 'image');
      return url
        ? `<a class="md-image-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer nofollow">[${label}]</a>`
        : `[${label}]`;
    },
    checkbox({ checked }: Tokens.Checkbox): string {
      return `<span class="md-checkbox${checked ? ' is-checked' : ''}">${checked ? '☑' : '☐'}</span> `;
    },
    code({ text, lang }: Tokens.Code): string {
      const { html } = highlightCode(text, lang ?? null);
      return `<pre class="md-pre"><code class="hljs">${html}</code></pre>`;
    },
    table(token: Tokens.Table): string {
      const header = token.header.map((cell) => this.tablecell(cell)).join('');
      const rows = token.rows.map((row) => `<tr>${row.map((cell) => this.tablecell(cell)).join('')}</tr>`).join('');
      return `<div class="md-table"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
    },
  },
});

function isFenceClosed(raw: string): boolean {
  const trimmed = raw.trimEnd();
  const open = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
  if (!open) return true; // bloque indentado: siempre completo
  const fence = open[1];
  const lines = trimmed.split('\n');
  if (lines.length < 2) return false;
  const last = lines[lines.length - 1].trim();
  return last.startsWith(fence[0].repeat(fence.length)) && /^[`~]+$/.test(last);
}

function renderTokens(tokens: Token[], links: TokensList['links']): string {
  const list = Object.assign([...tokens], { links }) as TokensList;
  return md.parser(list);
}

/**
 * Divide el Markdown en segmentos: HTML estático y bloques de código de
 * primer nivel (que se renderizan como componentes con acciones).
 */
export function renderMarkdown(text: string): MarkdownSegment[] {
  const tokens = md.lexer(text);
  const segments: MarkdownSegment[] = [];
  let buffer: Token[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const html = renderTokens(buffer, tokens.links);
    if (html.trim()) segments.push({ kind: 'html', key: `h${segments.length}`, html });
    buffer = [];
  };
  for (const token of tokens) {
    if (token.type === 'code') {
      flush();
      const code = token as Tokens.Code;
      segments.push({
        kind: 'code',
        key: `c${segments.length}`,
        code: code.text,
        lang: (code.lang ?? '').trim(),
        closed: isFenceClosed(code.raw),
      });
    } else {
      buffer.push(token);
    }
  }
  flush();
  return segments;
}

const cache = new Map<string, MarkdownSegment[]>();
const CACHE_MAX = 300;

/** `renderMarkdown` con caché LRU (los mensajes completos no se re-parsean). */
export function renderMarkdownCached(text: string): MarkdownSegment[] {
  const hit = cache.get(text);
  if (hit) {
    cache.delete(text);
    cache.set(text, hit);
    return hit;
  }
  const result = renderMarkdown(text);
  cache.set(text, result);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return result;
}
