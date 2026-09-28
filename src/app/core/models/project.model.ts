import { ModelRef } from './llm.model';

/**
 * - `fs-access`: carpeta seleccionada con File System Access API (handle persistente).
 * - `snapshot`: carpeta subida con `<input webkitdirectory>`; se guarda una instantánea.
 * - `none`: proyecto sin carpeta (solo instrucciones).
 */
export type ProjectSource = 'fs-access' | 'snapshot' | 'none';

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  ignorePatterns: string[];
  defaultModel: ModelRef | null;
  source: ProjectSource;
  /** Nombre de la carpeta raíz (el navegador no expone rutas absolutas). */
  rootName: string | null;
  createdAt: number;
  updatedAt: number;
  snapshotFileCount?: number;
  snapshotAt?: number;
}

export type PermissionStateValue = 'granted' | 'prompt' | 'denied' | 'unavailable';

export interface ProjectTreeNode {
  name: string;
  /** Ruta relativa con `/`. */
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  children?: ProjectTreeNode[];
  /** Para directorios: se han cargado sus hijos. */
  loaded?: boolean;
  ignored?: boolean;
}

/** Archivo guardado en la instantánea de un proyecto `snapshot`. */
export interface SnapshotFile {
  /** `${projectId}:${path}` */
  key: string;
  projectId: string;
  path: string;
  size: number;
  lastModified: number;
  /** Contenido textual si es de texto y cabe en los límites; si no, undefined. */
  text?: string;
  binary: boolean;
}

export interface ProjectFileContent {
  path: string;
  size: number;
  binary: boolean;
  text?: string;
  truncated: boolean;
}
