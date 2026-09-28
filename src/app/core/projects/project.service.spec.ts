import { TestBed } from '@angular/core/testing';
import { setupStorage } from '../../../testing/test-helpers';
import { StorageService } from '../storage/storage.service';
import { ProjectService } from './project.service';

function folderFile(path: string, content: string | Uint8Array): File {
  const file = new File([content as BlobPart], path.split('/').pop() as string, {
    type: 'text/plain',
    lastModified: 1,
  });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

describe('ProjectService', () => {
  let service: ProjectService;
  let storage: StorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    storage = setupStorage();
    service = TestBed.inject(ProjectService);
  });

  it('crea, actualiza y elimina proyectos', async () => {
    const p = await service.create({ name: 'Mi app', instructions: 'Sé breve' });
    expect(service.projects().length).toBe(1);
    expect(service.accessOf(p.id)).toBe('none');
    await service.update(p.id, { name: 'Renombrado' });
    expect(service.get(p.id)?.name).toBe('Renombrado');
    expect((await storage.get<{ name: string }>('projects', p.id))?.name).toBe('Renombrado');
    await service.remove(p.id);
    expect(service.projects().length).toBe(0);
    expect(await storage.get('projects', p.id)).toBeUndefined();
  });

  it('importa una instantánea (fallback sin File System Access API) respetando ignores', async () => {
    const p = await service.create({ name: 'Proyecto' });
    const result = await service.importSnapshot(p.id, [
      folderFile('flutter-app/README.md', '# Hola'),
      folderFile('flutter-app/lib/main.dart', 'void main() {}'),
      folderFile('flutter-app/node_modules/x/index.js', 'ignored'),
      folderFile('flutter-app/.git/HEAD', 'ref'),
      folderFile('flutter-app/assets/logo.png', new Uint8Array([0, 1, 2, 3])),
    ]);
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(2);
    const project = service.get(p.id);
    expect(project?.source).toBe('snapshot');
    expect(project?.rootName).toBe('flutter-app');
    expect(project?.name).toBe('flutter-app');
    expect(service.canRead(p.id)).toBe(true);
    expect(service.canWrite(p.id)).toBe(false);

    const root = await service.listChildren(p.id, '');
    expect(root.map((n) => `${n.kind}:${n.name}`)).toEqual(['directory:assets', 'directory:lib', 'file:README.md']);
    expect((await service.listChildren(p.id, 'lib')).map((n) => n.path)).toEqual(['lib/main.dart']);

    const readme = await service.readFile(p.id, 'README.md', 1000);
    expect(readme.text).toBe('# Hola');
    const bin = await service.readFile(p.id, 'assets/logo.png', 1000);
    expect(bin.binary).toBe(true);
    expect(bin.text).toBeUndefined();

    const all = await service.listAllFiles(p.id);
    expect(all.paths).toEqual(['README.md', 'assets/logo.png', 'lib/main.dart']);
    expect(await service.statFiles(p.id, ['README.md', 'nope'])).toEqual({ 'README.md': 6, nope: null });
  });

  it('trunca la lectura según el límite indicado', async () => {
    const p = await service.create({ name: 'X' });
    await service.importSnapshot(p.id, [folderFile('root/big.txt', 'a'.repeat(100))]);
    const content = await service.readFile(p.id, 'big.txt', 10);
    expect(content.truncated).toBe(true);
    expect(content.text?.length).toBe(10);
  });

  it('informa de archivos inexistentes', async () => {
    const p = await service.create({ name: 'X' });
    await service.importSnapshot(p.id, [folderFile('root/a.txt', 'a')]);
    await expect(service.readFile(p.id, 'missing.txt', 10)).rejects.toMatchObject({ code: 'not_found' });
    expect(await service.readForDiff(p.id, 'missing.txt')).toBeNull();
  });

  it('rechaza la conexión de carpetas si el navegador no la soporta', async () => {
    const p = await service.create({ name: 'X' });
    await expect(service.connectDirectory(p.id)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('desconectar elimina la instantánea', async () => {
    const p = await service.create({ name: 'X' });
    await service.importSnapshot(p.id, [folderFile('root/a.txt', 'a')]);
    await service.disconnectDirectory(p.id);
    expect(service.get(p.id)?.source).toBe('none');
    expect((await storage.getAll('snapshotFiles')).length).toBe(0);
  });
});
