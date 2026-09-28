import { SseParser, readSseEvents } from './sse';

describe('SseParser', () => {
  it('parsea eventos completos y fragmentados', () => {
    const p = new SseParser();
    expect(p.push('event: a\ndata: {"x"')).toEqual([]);
    expect(p.push(':1}\n\ndata: second\n')).toEqual([{ event: 'a', data: '{"x":1}' }]);
    expect(p.push('\n')).toEqual([{ data: 'second' }]);
  });

  it('admite CRLF, comentarios y data multilínea', () => {
    const p = new SseParser();
    const events = p.push(': ping\r\ndata: line1\r\ndata: line2\r\n\r\n');
    expect(events).toEqual([{ data: 'line1\nline2' }]);
  });

  it('no parte un CRLF dividido entre chunks', () => {
    const p = new SseParser();
    expect(p.push('data: a\r')).toEqual([]);
    expect(p.push('\n\r\n')).toEqual([{ data: 'a' }]);
  });

  it('vacía el último evento al terminar', () => {
    const p = new SseParser();
    p.push('data: tail');
    expect(p.flush()).toEqual([{ data: 'tail' }]);
  });
});

describe('readSseEvents', () => {
  function streamResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(body);
  }

  it('lee un stream por chunks', async () => {
    const events = [];
    for await (const e of readSseEvents(streamResponse(['data: 1\n\nda', 'ta: 2\n\n', 'data: [DONE]\n\n'])))
      events.push(e.data);
    expect(events).toEqual(['1', '2', '[DONE]']);
  });
});
