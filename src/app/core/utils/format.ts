export function formatBytes(bytes: number, locale = 'es'): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 });
  return `${fmt.format(value)} ${units[unit]}`;
}

/** 128000 → "128k", 1048576 → "1M". */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const v = tokens / 1_000_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}M`;
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return String(tokens);
}

export function fileExtension(name: string): string {
  const base = name.split('/').pop() ?? name;
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : '';
}

/** Recorta un texto alrededor de una coincidencia para mostrar contexto en búsquedas. */
export function snippetAround(text: string, query: string, radius = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const idx = flat.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + query.length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}
