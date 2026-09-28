import { TestBed } from '@angular/core/testing';
import { setupStorage } from '../../../testing/test-helpers';
import { SettingsService } from '../settings/settings.service';
import { compileIgnore } from '../utils/glob';
import { AttachmentService, arrayBufferToBase64 } from './attachment.service';
import { extractClipboardFiles } from './clipboard';
import { collectDroppedFiles } from './drop';

/** DataTransfer mínimo para jsdom (que no implementa la API). */
function fakeDataTransfer(files: File[], text = ''): DataTransfer {
  return {
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    files,
    getData: (type: string) => (type === 'text/plain' ? text : ''),
  } as unknown as DataTransfer;
}

describe('extractClipboardFiles', () => {
  const now = new Date('2026-09-26T10:00:00Z');
  const image = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' });

  it('adjunta imágenes pegadas y las renombra', () => {
    const r = extractClipboardFiles(fakeDataTransfer([image]), now);
    expect(r.consume).toBe(true);
    expect(r.files.length).toBe(1);
    expect(r.files[0].name).toBe('pegado-2026-09-26-10-00-00.png');
    expect(r.files[0].type).toBe('image/png');
  });

  it('no rompe el pegado de texto (Word/Excel añaden una imagen)', () => {
    const r = extractClipboardFiles(fakeDataTransfer([image], 'texto copiado'), now);
    expect(r.consume).toBe(false);
    expect(r.files).toEqual([]);
  });

  it('ignora portapapeles sin archivos', () => {
    expect(extractClipboardFiles(fakeDataTransfer([], 'hola'))).toEqual({ files: [], consume: false });
    expect(extractClipboardFiles(null)).toEqual({ files: [], consume: false });
  });

  it('conserva nombres no genéricos', () => {
    const named = new File(['x'], 'captura.png', { type: 'image/png' });
    expect(extractClipboardFiles(fakeDataTransfer([named]), now).files[0].name).toBe('captura.png');
  });
});

describe('AttachmentService', () => {
  let service: AttachmentService;
  let settings: SettingsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    setupStorage();
    service = TestBed.inject(AttachmentService);
    settings = TestBed.inject(SettingsService);
  });

  it('procesa archivos de texto', async () => {
    const a = await service.process(new File(['const a = 1;'], 'main.ts', { type: '' }), { source: 'upload' });
    expect(a.kind).toBe('text');
    expect(a.textContent).toBe('const a = 1;');
    expect(a.truncated).toBe(false);
  });

  it('procesa imágenes como base64', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const a = await service.process(new File([bytes], 'shot.png', { type: 'image/png' }), { source: 'paste' });
    expect(a.kind).toBe('image');
    expect(a.dataBase64).toBe(arrayBufferToBase64(bytes.buffer));
    expect(AttachmentService.previewUrl(a)).toMatch(/^data:image\/png;base64,/);
  });

  it('no interpreta binarios como texto', async () => {
    const a = await service.process(new File([new Uint8Array([1, 0, 2, 0, 3])], 'data.dat'), { source: 'upload' });
    expect(a.kind).toBe('binary');
    expect(a.textContent).toBeUndefined();
    const pdf = await service.process(new File(['%PDF-1.7'], 'doc.pdf', { type: 'application/pdf' }), {
      source: 'upload',
    });
    expect(pdf.kind).toBe('binary');
  });

  it('sanea nombres de archivo', async () => {
    const a = await service.process(new File(['x'], '../../evil<>.txt'), { source: 'upload' });
    expect(a.name).toBe('evil.txt');
  });

  it('rechaza archivos demasiado grandes con un mensaje comprensible', async () => {
    settings.update({ maxFileSizeMB: 0.1 });
    const big = new File([new Uint8Array(200 * 1024)], 'big.txt');
    await expect(service.process(big, { source: 'upload' })).rejects.toMatchObject({ code: 'too_large' });
  });

  it('respeta la lista de extensiones permitidas', async () => {
    settings.update({ allowedExtensions: ['ts'] });
    await expect(service.process(new File(['x'], 'a.js'), { source: 'upload' })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(service.process(new File(['x'], 'a.ts'), { source: 'upload' })).resolves.toBeTruthy();
  });

  it('trunca textos que superan el límite de contexto', async () => {
    settings.update({ maxContextKB: 8 });
    const a = await service.process(new File(['a'.repeat(10_000)], 'long.txt'), { source: 'upload' });
    expect(a.truncated).toBe(true);
    expect(a.textContent?.length).toBe(8 * 1024);
  });
});

describe('collectDroppedFiles', () => {
  function fileEntry(name: string, content = 'x'): FileSystemFileEntry {
    return {
      isFile: true,
      isDirectory: false,
      name,
      file: (cb: (f: File) => void) => cb(new File([content], name)),
    } as unknown as FileSystemFileEntry;
  }
  function dirEntry(name: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
    return {
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => {
        let done = false;
        return {
          readEntries: (cb: (e: FileSystemEntry[]) => void) => {
            const batch = done ? [] : children;
            done = true;
            cb(batch);
          },
        };
      },
    } as unknown as FileSystemDirectoryEntry;
  }

  it('recorre carpetas, aplica ignores y límites', async () => {
    const tree = dirEntry('app', [
      fileEntry('main.ts'),
      dirEntry('node_modules', [fileEntry('x.js')]),
      dirEntry('src', [fileEntry('a.ts'), fileEntry('b.ts')]),
    ]);
    const result = await collectDroppedFiles([tree], compileIgnore(['node_modules/**']), 2);
    expect(result.files.map((f) => f.path)).toEqual(['app/main.ts', 'app/src/a.ts']);
    expect(result.truncated).toBe(true);
    expect(result.ignored).toBe(1);
  });

  it('acepta archivos sueltos', async () => {
    const result = await collectDroppedFiles([new File(['a'], 'a.txt')], compileIgnore([]), 10);
    expect(result.files[0].path).toBeUndefined();
  });
});
