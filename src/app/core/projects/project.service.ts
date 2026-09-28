import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AppError,
  ModelRef,
  PermissionStateValue,
  Project,
  ProjectFileContent,
  ProjectTreeNode,
  SnapshotFile,
} from '../models';
import {
  listDirectory,
  listSnapshotLevel,
  queryPermission,
  readProjectFile,
  resolveFile,
  requestPermission,
  stripRootSegment,
  walkFiles,
  writeProjectFile,
} from '../filesystem/project-fs';
import { browserSupport } from '../filesystem/fs-support';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { isKnownBinaryName, isKnownTextName, looksBinary } from '../utils/binary';
import { normalizeRelativePath } from '../utils/file-name';
import { CompiledIgnore, compileIgnore } from '../utils/glob';
import { createId } from '../utils/id';

/** Estado de acceso a la carpeta de un proyecto. */
export type ProjectAccessState = PermissionStateValue | 'missing' | 'snapshot' | 'none';

const SNAPSHOT_FILE_MAX_BYTES = 1024 * 1024;
const SNAPSHOT_TOTAL_MAX_BYTES = 50 * 1024 * 1024;
const SNAPSHOT_MAX_FILES = 10_000;

export interface NewProjectInput {
  name: string;
  description?: string;
  instructions?: string;
  defaultModel?: ModelRef | null;
}

export interface SnapshotImportResult {
  imported: number;
  skipped: number;
  truncated: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly storage = inject(StorageService);
  private readonly settings = inject(SettingsService);
  private readonly handles = new Map<string, FileSystemDirectoryHandle>();
  private readonly snapshotIndex = new Map<string, Pick<SnapshotFile, 'path' | 'size' | 'lastModified' | 'binary'>[]>();

  readonly projects = signal<Project[]>([]);
  readonly access = signal<Record<string, ProjectAccessState>>({});
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  readonly sortedProjects = computed(() => [...this.projects()].sort((a, b) => b.updatedAt - a.updatedAt));

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      const projects = await this.storage.getAll<Project>('projects');
      this.projects.set(projects);
      const access: Record<string, ProjectAccessState> = {};
      for (const p of projects) {
        access[p.id] = p.source === 'snapshot' ? 'snapshot' : p.source === 'none' ? 'none' : 'unavailable';
        if (p.source === 'fs-access') {
          const handle = await this.storage.get<FileSystemDirectoryHandle>('handles', p.id).catch(() => undefined);
          if (handle) {
            this.handles.set(p.id, handle);
            access[p.id] = await queryPermission(handle, 'read');
          } else {
            access[p.id] = 'missing';
          }
        }
      }
      this.access.set(access);
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  get(id: string | null | undefined): Project | undefined {
    return id ? this.projects().find((p) => p.id === id) : undefined;
  }

  accessOf(id: string): ProjectAccessState {
    return this.access()[id] ?? 'none';
  }

  ignoreFor(project: Project): CompiledIgnore {
    return compileIgnore([...this.settings.settings().ignorePatterns, ...project.ignorePatterns]);
  }

  async create(input: NewProjectInput): Promise<Project> {
    const now = Date.now();
    const project: Project = {
      id: createId(),
      name: input.name.trim() || 'Proyecto',
      description: input.description ?? '',
      instructions: input.instructions ?? '',
      ignorePatterns: [],
      defaultModel: input.defaultModel ?? null,
      source: 'none',
      rootName: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.put('projects', project);
    this.projects.update((list) => [...list, project]);
    this.setAccess(project.id, 'none');
    return project;
  }

  async update(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
    const current = this.get(id);
    if (!current) return;
    const next: Project = { ...current, ...patch, id, updatedAt: Date.now() };
    await this.storage.put('projects', next);
    this.projects.update((list) => list.map((p) => (p.id === id ? next : p)));
  }

  async remove(id: string): Promise<void> {
    await this.storage.delete('projects', id);
    await this.storage.delete('handles', id).catch(() => undefined);
    await this.storage.deleteByIndex('snapshotFiles', 'projectId', id).catch(() => undefined);
    this.handles.delete(id);
    this.snapshotIndex.delete(id);
    this.projects.update((list) => list.filter((p) => p.id !== id));
    this.access.update((a) => {
      const next = { ...a };
      delete next[id];
      return next;
    });
  }

  /**
   * Abre el selector nativo de carpetas (File System Access API) y asocia
   * el handle al proyecto. Lanza AppError('unsupported') si no hay soporte.
   * Devuelve false si el usuario cancela.
   */
  async connectDirectory(id: string): Promise<boolean> {
    if (!browserSupport.directoryPicker() || !window.showDirectoryPicker) {
      throw new AppError('unsupported', 'Directory picker not supported');
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ id: `project-${id.slice(0, 20)}`, mode: 'read' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      throw new AppError('permission', 'Directory selection failed', {
        detail: error instanceof Error ? error.message : undefined,
      });
    }
    await this.storage.put('handles', handle, id);
    await this.storage.deleteByIndex('snapshotFiles', 'projectId', id).catch(() => undefined);
    this.snapshotIndex.delete(id);
    this.handles.set(id, handle);
    const project = this.get(id);
    await this.update(id, {
      source: 'fs-access',
      rootName: handle.name,
      name: project && project.name !== 'Proyecto' ? project.name : handle.name,
      snapshotFileCount: undefined,
      snapshotAt: undefined,
    });
    this.setAccess(id, await queryPermission(handle, 'read'));
    return true;
  }

  /** Solicita permiso de lectura (requiere gesto del usuario). */
  async grantAccess(id: string): Promise<ProjectAccessState> {
    const handle = this.handles.get(id);
    if (!handle) {
      this.setAccess(id, 'missing');
      return 'missing';
    }
    const state = await requestPermission(handle, 'read');
    this.setAccess(id, state);
    return state;
  }

  /**
   * Fallback sin File System Access API: importa una instantánea de los
   * archivos seleccionados con `<input webkitdirectory>`.
   */
  async importSnapshot(id: string, files: readonly File[]): Promise<SnapshotImportResult> {
    const project = this.get(id);
    if (!project) throw new AppError('not_found', 'Project not found');
    const ignore = this.ignoreFor(project);
    const entries: SnapshotFile[] = [];
    let rootName = project.rootName;
    let skipped = 0;
    let total = 0;
    let truncated = false;
    for (const file of files) {
      const { root, path: rawPath } = stripRootSegment(file.webkitRelativePath || file.name);
      rootName ??= root || null;
      const path = normalizeRelativePath(rawPath);
      if (!path || ignore.test(path)) {
        skipped++;
        continue;
      }
      if (entries.length >= SNAPSHOT_MAX_FILES) {
        truncated = true;
        break;
      }
      const entry: SnapshotFile = {
        key: `${id}:${path}`,
        projectId: id,
        path,
        size: file.size,
        lastModified: file.lastModified,
        binary: false,
      };
      if (
        (isKnownBinaryName(path) && !isKnownTextName(path)) ||
        file.size > SNAPSHOT_FILE_MAX_BYTES ||
        total + file.size > SNAPSHOT_TOTAL_MAX_BYTES
      ) {
        entry.binary = isKnownBinaryName(path);
      } else {
        const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
        if (looksBinary(head)) entry.binary = true;
        else {
          entry.text = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer());
          total += file.size;
        }
      }
      entries.push(entry);
    }
    await this.storage.deleteByIndex('snapshotFiles', 'projectId', id).catch(() => undefined);
    await this.storage.delete('handles', id).catch(() => undefined);
    this.handles.delete(id);
    for (let i = 0; i < entries.length; i += 500)
      await this.storage.putMany('snapshotFiles', entries.slice(i, i + 500));
    this.snapshotIndex.set(
      id,
      entries.map(({ path, size, lastModified, binary }) => ({ path, size, lastModified, binary })),
    );
    await this.update(id, {
      source: 'snapshot',
      rootName,
      name: project.name === 'Proyecto' && rootName ? rootName : project.name,
      snapshotFileCount: entries.length,
      snapshotAt: Date.now(),
    });
    this.setAccess(id, 'snapshot');
    return { imported: entries.length, skipped, truncated };
  }

  async disconnectDirectory(id: string): Promise<void> {
    await this.storage.delete('handles', id).catch(() => undefined);
    await this.storage.deleteByIndex('snapshotFiles', 'projectId', id).catch(() => undefined);
    this.handles.delete(id);
    this.snapshotIndex.delete(id);
    await this.update(id, { source: 'none', rootName: null, snapshotFileCount: undefined, snapshotAt: undefined });
    this.setAccess(id, 'none');
  }

  canRead(id: string): boolean {
    const state = this.accessOf(id);
    return state === 'granted' || state === 'snapshot';
  }

  canWrite(id: string): boolean {
    return this.get(id)?.source === 'fs-access' && this.handles.has(id);
  }

  async listChildren(id: string, path: string): Promise<ProjectTreeNode[]> {
    const project = this.requireProject(id);
    if (project.source === 'snapshot') return listSnapshotLevel(await this.snapshotFiles(id), path);
    const handle = await this.readableHandle(id);
    try {
      return await listDirectory(handle, path, this.ignoreFor(project));
    } catch (error) {
      this.markIfMissing(id, error, path);
      throw error;
    }
  }

  async listAllFiles(id: string): Promise<{ paths: string[]; truncated: boolean }> {
    const project = this.requireProject(id);
    if (project.source === 'snapshot')
      return { paths: (await this.snapshotFiles(id)).map((f) => f.path).sort(), truncated: false };
    const handle = await this.readableHandle(id);
    try {
      return await walkFiles(handle, this.ignoreFor(project));
    } catch (error) {
      this.markIfMissing(id, error, '');
      throw error;
    }
  }

  async readFile(id: string, path: string, maxBytes: number): Promise<ProjectFileContent> {
    const project = this.requireProject(id);
    if (project.source === 'snapshot') {
      const entry = await this.storage.get<SnapshotFile>('snapshotFiles', `${id}:${path}`);
      if (!entry) throw new AppError('not_found', 'File not in snapshot', { detail: path });
      if (entry.binary || entry.text === undefined)
        return { path, size: entry.size, binary: entry.binary, truncated: !entry.binary };
      const truncated = entry.text.length > maxBytes;
      return {
        path,
        size: entry.size,
        binary: false,
        text: truncated ? entry.text.slice(0, maxBytes) : entry.text,
        truncated,
      };
    }
    const handle = await this.readableHandle(id);
    try {
      return await readProjectFile(handle, path, maxBytes);
    } catch (error) {
      this.markIfMissing(id, error, path);
      throw error;
    }
  }

  /** Lee el `File` nativo (para adjuntarlo). Solo proyectos con carpeta real o instantánea de texto. */
  async readAsFile(id: string, path: string): Promise<File> {
    const project = this.requireProject(id);
    const name = path.split('/').pop() ?? path;
    if (project.source === 'snapshot') {
      const content = await this.readFile(id, path, SNAPSHOT_FILE_MAX_BYTES);
      if (content.binary || content.text === undefined)
        throw new AppError('unsupported', 'Binary snapshot file', { detail: path });
      return new File([content.text], name, { type: 'text/plain' });
    }
    const handle = await this.readableHandle(id);
    const fileHandle = await resolveFile(handle, path);
    return fileHandle.getFile();
  }

  /** Escribe un archivo tras confirmación explícita del usuario (pide permiso readwrite). */
  async writeFile(id: string, path: string, content: string): Promise<void> {
    const handle = this.handles.get(id);
    if (!handle) throw new AppError('unsupported', 'Project has no writable directory');
    const state = await requestPermission(handle, 'readwrite');
    if (state !== 'granted') throw new AppError('permission', 'Write permission denied', { detail: path });
    await writeProjectFile(handle, path, content);
  }

  /** Tamaños de archivos (sin leer su contenido). null = no disponible. */
  async statFiles(id: string, paths: readonly string[]): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = {};
    const project = this.get(id);
    if (!project || !this.canRead(id)) {
      for (const p of paths) result[p] = null;
      return result;
    }
    if (project.source === 'snapshot') {
      const index = await this.snapshotFiles(id);
      const map = new Map(index.map((f) => [f.path, f.size] as const));
      for (const p of paths) result[p] = map.get(p) ?? null;
      return result;
    }
    const handle = this.handles.get(id);
    await Promise.all(
      paths.map(async (p) => {
        try {
          result[p] = handle ? (await (await resolveFile(handle, p)).getFile()).size : null;
        } catch {
          result[p] = null;
        }
      }),
    );
    return result;
  }

  /** Lectura no interactiva para comparar antes de escribir. Devuelve null si no existe. */
  async readForDiff(id: string, path: string): Promise<string | null> {
    try {
      const content = await this.readFile(id, path, 5 * 1024 * 1024);
      return content.binary ? null : (content.text ?? '');
    } catch (error) {
      if (error instanceof AppError && error.code === 'not_found') return null;
      throw error;
    }
  }

  private async readableHandle(id: string): Promise<FileSystemDirectoryHandle> {
    const handle = this.handles.get(id);
    if (!handle) {
      this.setAccess(id, 'missing');
      throw new AppError('not_found', 'Directory handle missing');
    }
    const state = await queryPermission(handle, 'read');
    this.setAccess(id, state);
    if (state !== 'granted') throw new AppError('permission', 'Read permission required');
    return handle;
  }

  private async snapshotFiles(id: string): Promise<Pick<SnapshotFile, 'path' | 'size' | 'lastModified' | 'binary'>[]> {
    let index = this.snapshotIndex.get(id);
    if (!index) {
      const files = await this.storage.getAllByIndex<SnapshotFile>('snapshotFiles', 'projectId', id);
      index = files.map(({ path, size, lastModified, binary }) => ({ path, size, lastModified, binary }));
      this.snapshotIndex.set(id, index);
    }
    return index;
  }

  private requireProject(id: string): Project {
    const project = this.get(id);
    if (!project) throw new AppError('not_found', 'Project not found');
    return project;
  }

  private markIfMissing(id: string, error: unknown, path: string): void {
    if (error instanceof AppError && error.code === 'not_found' && path === '') this.setAccess(id, 'missing');
  }

  private setAccess(id: string, state: ProjectAccessState): void {
    this.access.update((a) => ({ ...a, [id]: state }));
  }
}
