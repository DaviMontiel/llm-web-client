import { detectCodePath } from './code-path';
import { highlightCode, languageLabel, resolveLanguage } from './highlight';
import { renderMarkdown, safeUrl } from './markdown';

function html(md: string): string {
  return renderMarkdown(md)
    .filter((s) => s.kind === 'html')
    .map((s) => (s.kind === 'html' ? s.html : ''))
    .join('');
}

describe('renderMarkdown', () => {
  it('separa bloques de código de primer nivel', () => {
    const segs = renderMarkdown('Texto\n\n```ts\nconst a = 1;\n```\n\nMás');
    expect(segs.map((s) => s.kind)).toEqual(['html', 'code', 'html']);
    const code = segs[1];
    expect(code.kind === 'code' && code.lang).toBe('ts');
    expect(code.kind === 'code' && code.closed).toBe(true);
  });

  it('detecta bloques abiertos durante el streaming', () => {
    const segs = renderMarkdown('```python\nprint(1)');
    expect(segs[0].kind === 'code' && segs[0].closed).toBe(false);
  });

  it('renderiza tablas, listas y enlaces seguros', () => {
    const out = html('| a | b |\n|---|---|\n| 1 | 2 |\n\n- uno\n- dos\n\n[web](https://example.com)');
    expect(out).toContain('<table>');
    expect(out).toContain('<li>uno</li>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('escapa HTML crudo del modelo (XSS)', () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)> y <b>negrita</b>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('neutraliza enlaces javascript: y data:', () => {
    const out = html('[x](javascript:alert(1)) [y](data:text/html,hi) [z](JaVaScRiPt:alert(1))');
    expect(out).not.toContain('href');
  });

  it('no carga imágenes remotas', () => {
    const out = html('![logo](https://tracker.example/pixel.png)');
    expect(out).not.toContain('<img');
    expect(out).toContain('md-image-link');
  });
});

describe('safeUrl', () => {
  it('solo permite protocolos seguros', () => {
    expect(safeUrl('https://a.com')).toBe('https://a.com');
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeUrl('#anchor')).toBe('#anchor');
    expect(safeUrl('java\nscript:alert(1)')).toBeNull();
    expect(safeUrl('/relative')).toBeNull();
  });
});

describe('highlight', () => {
  it('resuelve alias y etiquetas', () => {
    expect(resolveLanguage('ts')).toBe('typescript');
    expect(resolveLanguage('html')).toBe('xml');
    expect(languageLabel('py')).toBe('Python');
    expect(languageLabel('cobol')).toBe('cobol');
  });

  it('escapa el código de lenguajes desconocidos', () => {
    expect(highlightCode('<b>x</b>', 'cobol').html).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('genera spans de resaltado', () => {
    expect(highlightCode('const a = 1;', 'ts').html).toContain('hljs-keyword');
  });
});

describe('detectCodePath', () => {
  it('lee la ruta del info string o de la primera línea', () => {
    expect(detectCodePath('ts src/app/app.ts', '')).toBe('src/app/app.ts');
    expect(detectCodePath('ts:src/main.ts', '')).toBe('src/main.ts');
    expect(detectCodePath('ts title="lib/a.ts"', '')).toBe('lib/a.ts');
    expect(detectCodePath('python', '# file: tools/run.py\nprint(1)')).toBe('tools/run.py');
    expect(detectCodePath('ts', '// src/x.ts\nexport {}')).toBe('src/x.ts');
    expect(detectCodePath('ts', 'const a = 1;')).toBeNull();
    expect(detectCodePath('ts ../../etc/passwd.txt', '')).toBeNull();
  });
});
