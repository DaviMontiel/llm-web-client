/** Evento Server-Sent Events. */
export interface SseEvent {
  event?: string;
  data: string;
}

/**
 * Parser incremental de SSE conforme a la especificación (líneas `event:`,
 * `data:` multilínea, comentarios `:` y separadores CRLF/LF).
 */
export class SseParser {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName: string | undefined;

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, newlineIdx);
      const sepLength = this.buffer.startsWith('\r\n', newlineIdx) ? 2 : 1;
      // Un `\r` al final del buffer podría ir seguido de `\n` en el siguiente chunk.
      if (this.buffer[newlineIdx] === '\r' && newlineIdx + 1 === this.buffer.length) break;
      this.buffer = this.buffer.slice(newlineIdx + sepLength);
      const ev = this.processLine(line);
      if (ev) events.push(ev);
    }
    return events;
  }

  /** Vacía lo pendiente al terminar el stream. */
  flush(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buffer.length > 0) {
      const ev = this.processLine(this.buffer.replace(/\r$/, ''));
      this.buffer = '';
      if (ev) events.push(ev);
    }
    const last = this.dispatch();
    if (last) events.push(last);
    return events;
  }

  private processLine(line: string): SseEvent | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon >= 0 ? line.slice(0, colon) : line;
    let value = colon >= 0 ? line.slice(colon + 1) : '';
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.dataLines.push(value);
    else if (field === 'event') this.eventName = value;
    return null;
  }

  private dispatch(): SseEvent | null {
    if (this.dataLines.length === 0) {
      this.eventName = undefined;
      return null;
    }
    const ev: SseEvent = { data: this.dataLines.join('\n') };
    if (this.eventName) ev.event = this.eventName;
    this.dataLines = [];
    this.eventName = undefined;
    return ev;
  }
}

/**
 * Itera los eventos SSE de una respuesta fetch. Si el navegador no expone
 * `response.body` como stream, degrada leyendo el texto completo.
 */
export async function* readSseEvents(response: Response): AsyncGenerator<SseEvent> {
  const parser = new SseParser();
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    yield* parser.push(text);
    yield* parser.flush();
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const events = parser.push(decoder.decode(value, { stream: true }));
      for (const e of events) yield e;
    }
    const tail = decoder.decode();
    if (tail) for (const e of parser.push(tail)) yield e;
    for (const e of parser.flush()) yield e;
  } finally {
    reader.releaseLock();
  }
}

export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
