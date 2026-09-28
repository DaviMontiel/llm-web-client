import { AppError, PermissionStateValue, ProjectFileContent, ProjectTreeNode, SnapshotFile } from '../models';
import { isKnownBinaryName, isKnownTextName, looksBinary } from '../utils/binary';
import { normalizeRelativePath } from '../utils/file-name';
import { CompiledIgnore } from '../utils/glob';

/** Funciones puras sobre FileSystemDirectoryHandle y sobre instantáneas. */

export async function queryPermission(
  handle: FileSystemHandle,
  mode: FsPermissionMode = 'read',
): Promise<PermissionStateValue> {
  if (typeof handle.queryPermission !== 'function') return 'granted';
  try {
    return await handle.queryPermission({ mode });
  } catch {
    return 'unavailable';
  }
}

/** Debe llamarse desde un gesto del usuario (click), o el navegador lo rechazará. */
export async function requestPermission(
  handle: FileSystemHandle,
  mode: FsPermissionMode = 'read',
): Promise<PermissionStateValue> {
  if (typeof handle.requestPermission !== 'function') return 'granted';
  try {
    return await handle.requestPermission({ mode });
  } catch {
    return 'denied';
  }
}

function mapFsError(error: unknown, path: string): AppError {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotFoundError') return new AppError('not_found', `Not found: ${path}`, { detail: path });
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new AppError('permission', 'Permission denied', { detail: path });
  if (name === 'TypeMismatchError') return new AppError('invalid', 'Type mismatch', { detail: path });
  return new AppError('unknown', 'File system error', { detail: error instanceof Error ? error.message : path });
}

export async function resolveDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  if (!path) return root;
  const normalized = normalizeRelativePath(path);
  if (!normalized) throw new AppError('invalid', 'Invalid path', { detail: path });
  let dir = root;
  try {
    for (const part of normalized.split('/')) dir = await dir.getDirectoryHandle(part);
  } catch (error) {
    throw mapFsError(error, path);
  }
  return dir;
}

export async function resolveFile(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemFileHandle> {
  const normalized = normalizeRelativePath(path);
  if (!normalized) throw new AppError('invalid', 'Invalid path', { detail: path });
  const parts = normalized.split('/');
  const fileName = parts.pop() as string;
  try {
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return await dir.getFileHandle(fileName, { create });
  } catch (error) {
    throw mapFsError(error, path);
  }
}

export function sortNodes(nodes: ProjectTreeNode[]): ProjectTreeNode[] {
  return nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
}

/** Lista un nivel del directorio (carga perezosa). */
export async function listDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
  ignore: CompiledIgnore,
  includeIgnored = false,
): Promise<ProjectTreeNode[]> {
  const dir = await resolveDirectory(root, path);
  const nodes: ProjectTreeNode[] = [];
  try {
    for await (const [name, handle] of dir.entries()) {
      const childPath = path ? `${path}/${name}` : name;
      const isDir = handle.kind === 'directory';
      const ignored = ignore.test(childPath, isDir);
      if (ignored && !includeIgnored) continue;
      nodes.push({ name, path: childPath, kind: isDir ? 'directory' : 'file', ignored, loaded: false });
    }
  } catch (error) {
    throw mapFsError(error, path);
  }
  return sortNodes(nodes);
}

/** Recorre el árbol (sin entrar en ignorados) hasta `limit` archivos. */
export async function walkFiles(
  root: FileSystemDirectoryHandle,
  ignore: CompiledIgnore,
  limit = 5000,
): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  const stack: { dir: FileSystemDirectoryHandle; path: string }[] = [{ dir: root, path: '' }];
  while (stack.length) {
    const { dir, path } = stack.pop() as { dir: FileSystemDirectoryHandle; path: string };
    for await (const [name, handle] of dir.entries()) {
      const childPath = path ? `${path}/${name}` : name;
      if (handle.kind === 'directory') {
        if (!ignore.test(childPath, true)) stack.push({ dir: handle as FileSystemDirectoryHandle, path: childPath });
      } else if (!ignore.test(childPath, false)) {
        paths.push(childPath);
        if (paths.length >= limit) return { paths, truncated: true };
      }
    }
  }
  return { paths: paths.sort(), truncated: false };
}

/** Lee un archivo con detección de binarios y límite de tamaño. */
export async function readFileContent(file: File, path: string, maxBytes: number): Promise<ProjectFileContent> {
  if (isKnownBinaryName(path) && !isKnownTextName(path))
    return { path, size: file.size, binary: true, truncated: false };
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (looksBinary(head)) return { path, size: file.size, binary: true, truncated: false };
  const truncated = file.size > maxBytes;
  const blob = truncated ? file.slice(0, maxBytes) : file;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(await blob.arrayBuffer());
  return { path, size: file.size, binary: false, text, truncated };
}

export async function readProjectFile(
  root: FileSystemDirectoryHandle,
  path: string,
  maxBytes: number,
): Promise<ProjectFileContent> {
  const handle = await resolveFile(root, path);
  let file: File;
  try {
    file = await handle.getFile();
  } catch (error) {
    throw mapFsError(error, path);
  }
  return readFileContent(file, path, maxBytes);
}

export async function writeProjectFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const handle = await resolveFile(root, path, true);
  try {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (error) {
    throw mapFsError(error, path);
  }
}

/** Construye el árbol de un nivel a partir de las rutas de una instantánea. */
export function listSnapshotLevel(
  files: readonly Pick<SnapshotFile, 'path' | 'size' | 'lastModified'>[],
  path: string,
): ProjectTreeNode[] {
  const prefix = path ? `${path}/` : '';
  const dirs = new Set<string>();
  const nodes: ProjectTreeNode[] = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      nodes.push({ name: rest, path: f.path, kind: 'file', size: f.size, lastModified: f.lastModified });
    } else {
      const dirName = rest.slice(0, slash);
      if (!dirs.has(dirName)) {
        dirs.add(dirName);
        nodes.push({ name: dirName, path: `${prefix}${dirName}`, kind: 'directory', loaded: false });
      }
    }
  }
  return sortNodes(nodes);
}

/** Quita el primer segmento (la carpeta seleccionada) de `webkitRelativePath`. */
export function stripRootSegment(relativePath: string): { root: string; path: string } {
  const normalized = relativePath.replace(/\\/g, '/');
  const idx = normalized.indexOf('/');
  if (idx === -1) return { root: '', path: normalized };
  return { root: normalized.slice(0, idx), path: normalized.slice(idx + 1) };
}
