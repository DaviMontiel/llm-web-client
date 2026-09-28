import { Message } from '../models';
import { isKnownBinaryName, looksBinary } from './binary';
import {
  buildChildrenIndex,
  collectSubtree,
  deepestLeaf,
  getPathToLeaf,
  getSiblings,
  latestLeaf,
} from './conversation-tree';
import { dateGroupOf } from './date-groups';
import { normalizeRelativePath, sanitizeFileName } from './file-name';
import { formatBytes, formatTokens, snippetAround } from './format';
import { diffLines, diffStats } from './line-diff';
import { generateLocalTitle } from './title';

function msg(id: string, parentId: string | null, role: Message['role'], createdAt: number): Message {
  return {
    id,
    chatId: 'c',
    parentId,
    role,
    content: id,
    attachments: [],
    createdAt,
    updatedAt: createdAt,
    status: 'complete',
  };
}

describe('conversation-tree', () => {
  // u1 → a1 → u2 → a2
  //         ↘ u2b → a2b   (rama por edición)
  const messages = [
    msg('u1', null, 'user', 1),
    msg('a1', 'u1', 'assistant', 2),
    msg('u2', 'a1', 'user', 3),
    msg('a2', 'u2', 'assistant', 4),
    msg('u2b', 'a1', 'user', 5),
    msg('a2b', 'u2b', 'assistant', 6),
  ];

  it('resuelve la rama activa desde la hoja', () => {
    expect(getPathToLeaf(messages, 'a2').map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(getPathToLeaf(messages, 'a2b').map((m) => m.id)).toEqual(['u1', 'a1', 'u2b', 'a2b']);
    expect(getPathToLeaf(messages, 'missing')).toEqual([]);
  });

  it('desciende por el hijo más reciente', () => {
    expect(deepestLeaf(messages, 'a1')).toBe('a2b');
    expect(latestLeaf(messages)).toBe('a2b');
    expect(latestLeaf([])).toBeNull();
  });

  it('obtiene hermanos del mismo rol ordenados', () => {
    const u2 = messages[2];
    expect(getSiblings(messages, u2).map((m) => m.id)).toEqual(['u2', 'u2b']);
  });

  it('recoge subárboles completos', () => {
    expect([...collectSubtree(messages, 'u2')].sort()).toEqual(['a2', 'u2']);
    expect(collectSubtree(messages, 'a1').size).toBe(5);
  });

  it('no entra en bucles con datos corruptos', () => {
    const loop = [msg('x', 'y', 'user', 1), msg('y', 'x', 'assistant', 2)];
    expect(getPathToLeaf(loop, 'x').length).toBe(2);
    expect(buildChildrenIndex(loop).size).toBe(2);
  });
});

describe('generateLocalTitle', () => {
  it('limpia saludos, código y markdown', () => {
    expect(generateLocalTitle('Hola, ¿puedes revisar este `componente` de Angular? Gracias', 'Nuevo')).toBe(
      '¿puedes revisar este componente de Angular?',
    );
    expect(generateLocalTitle('```ts\nconst a = 1;\n```', 'Nuevo chat')).toBe('Nuevo chat');
  });

  it('recorta títulos largos', () => {
    const t = generateLocalTitle(
      'Refactoriza completamente el módulo de autenticación con tokens de refresco rotativos',
      'x',
      30,
    );
    expect(t.length).toBeLessThanOrEqual(30);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('file-name', () => {
  it('sanea nombres peligrosos', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('con.txt')).toBe('_con.txt');
    expect(sanitizeFileName('a<b>:c?.ts')).toBe('abc.ts');
    expect(sanitizeFileName('')).toBe('archivo.txt');
    expect(sanitizeFileName('.hidden')).toBe('hidden');
  });

  it('rechaza rutas que escapan del proyecto', () => {
    expect(normalizeRelativePath('src/app/app.ts')).toBe('src/app/app.ts');
    expect(normalizeRelativePath('./src\\a.ts')).toBe('src/a.ts');
    expect(normalizeRelativePath('../secret')).toBeNull();
    expect(normalizeRelativePath('/etc/passwd')).toBeNull();
    expect(normalizeRelativePath('C:/Windows')).toBeNull();
    expect(normalizeRelativePath('')).toBeNull();
  });
});

describe('binary detection', () => {
  it('detecta NUL y caracteres de control', () => {
    expect(looksBinary(new Uint8Array([72, 105, 0, 1]))).toBe(true);
    expect(looksBinary(new TextEncoder().encode('const x = 1;\n\tok'))).toBe(false);
    expect(looksBinary(new Uint8Array([]))).toBe(false);
  });

  it('reconoce extensiones binarias', () => {
    expect(isKnownBinaryName('a/b/logo.PNG')).toBe(true);
    expect(isKnownBinaryName('main.ts')).toBe(false);
  });
});

describe('line-diff', () => {
  it('calcula añadidos y eliminados', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc\nd');
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 });
    expect(lines.filter((l) => l.type === 'context').map((l) => l.text)).toEqual(['a', 'c']);
  });

  it('archivo idéntico no tiene cambios', () => {
    expect(diffStats(diffLines('x\ny', 'x\ny'))).toEqual({ added: 0, removed: 0 });
  });
});

describe('format', () => {
  it('formatea bytes y tokens', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatTokens(128_000)).toBe('128k');
    expect(formatTokens(1_000_000)).toBe('1M');
  });

  it('extrae fragmentos de contexto', () => {
    const s = snippetAround(`${'x '.repeat(100)}objetivo${' y'.repeat(100)}`, 'objetivo', 10);
    expect(s).toContain('objetivo');
    expect(s.startsWith('…')).toBe(true);
  });
});

describe('date groups', () => {
  it('agrupa por antigüedad', () => {
    const now = new Date(2026, 8, 26, 12).getTime();
    expect(dateGroupOf(now - 1000, now)).toBe('today');
    expect(dateGroupOf(now - 86_400_000, now)).toBe('yesterday');
    expect(dateGroupOf(now - 3 * 86_400_000, now)).toBe('week');
    expect(dateGroupOf(now - 30 * 86_400_000, now)).toBe('older');
  });
});
