import { CompiledIgnore } from '../utils/glob';

export interface DroppedFile {
  file: File;
  /** Ruta relativa si procede de una carpeta arrastrada. */
  path?: string;
}

export interface DropCollection {
  files: DroppedFile[];
  truncated: boolean;
  ignored: number;
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/**
 * Recoge los archivos de un drop, incluidas carpetas (vía `webkitGetAsEntry`).
 * Las entradas deben capturarse de forma síncrona dentro del evento `drop`,
 * por eso esta función recibe ya la lista de entradas/archivos.
 */
export async function collectDroppedFiles(
  entries: readonly (FileSystemEntry | File)[],
  ignore: CompiledIgnore,
  limit: number,
): Promise<DropCollection> {
  const result: DropCollection = { files: [], truncated: false, ignored: 0 };
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (result.files.length >= limit) {
      result.truncated = true;
      return;
    }
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      if (prefix && ignore.test(path)) {
        result.ignored++;
        return;
      }
      const file = await entryFile(entry as FileSystemFileEntry);
      result.files.push({ file, path: prefix ? path : undefined });
    } else if (entry.isDirectory) {
      if (prefix && ignore.test(path, true)) {
        result.ignored++;
        return;
      }
      const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
      for (const child of children) await walk(child, path);
    }
  };
  for (const item of entries) {
    if (result.files.length >= limit) {
      result.truncated = true;
      break;
    }
    if (item instanceof File) result.files.push({ file: item });
    else await walk(item, '');
  }
  return result;
}

/** Captura síncrona de las entradas de un DataTransfer (llamar dentro del handler de drop). */
export function captureDropEntries(data: DataTransfer | null): (FileSystemEntry | File)[] {
  if (!data) return [];
  const out: (FileSystemEntry | File)[] = [];
  const items = Array.from(data.items ?? []);
  if (items.length && typeof items[0].webkitGetAsEntry === 'function') {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry();
      if (entry) out.push(entry);
      else {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
    return out;
  }
  return Array.from(data.files ?? []);
}
