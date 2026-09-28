import { fileExtension } from './format';

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'tif',
  'tiff',
  'heic',
  'avif',
  'psd',
  'pdf',
  'zip',
  'gz',
  'tgz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'jar',
  'war',
  'apk',
  'aab',
  'ipa',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'o',
  'a',
  'lib',
  'class',
  'pyc',
  'wasm',
  'dex',
  'mp3',
  'mp4',
  'wav',
  'ogg',
  'flac',
  'mov',
  'avi',
  'mkv',
  'webm',
  'm4a',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'sqlite',
  'db',
  'keystore',
  'jks',
  'p12',
  'pfx',
]);

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'cfg',
  'conf',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'svg',
  'xml',
  'csv',
  'tsv',
  'py',
  'rb',
  'php',
  'java',
  'kt',
  'kts',
  'swift',
  'go',
  'rs',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'dart',
  'sql',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'lua',
  'r',
  'vue',
  'svelte',
  'gradle',
  'properties',
  'dockerfile',
  'makefile',
  'graphql',
  'gql',
  'proto',
  'log',
  'diff',
  'patch',
  'lock',
  'gitignore',
  'editorconfig',
]);

export const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isKnownBinaryName(name: string): boolean {
  return BINARY_EXTENSIONS.has(fileExtension(name));
}

export function isKnownTextName(name: string): boolean {
  const ext = fileExtension(name);
  if (ext) return TEXT_EXTENSIONS.has(ext);
  const base = (name.split('/').pop() ?? name).toLowerCase();
  return ['dockerfile', 'makefile', 'license', 'readme', 'procfile', '.gitignore', '.env'].includes(base);
}

/**
 * Heurística de contenido binario sobre los primeros bytes:
 * un byte NUL o más de un 10 % de caracteres de control no imprimibles.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const len = Math.min(bytes.length, 8192);
  if (len === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 7 || (b > 13 && b < 32 && b !== 27)) suspicious++;
  }
  return suspicious / len > 0.1;
}

export function mimeFromName(name: string): string {
  const ext = fileExtension(name);
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    json: 'application/json',
    md: 'text/markdown',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/plain',
    txt: 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}
