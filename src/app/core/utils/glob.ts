/**
 * Matcher de patrones tipo .gitignore (subconjunto razonable):
 * - `*` cualquier secuencia sin `/`; `**` cualquier secuencia (incluida `/`); `?` un carácter.
 * - Un patrón sin `/` se compara con cada segmento de la ruta (p. ej. `*.lock`, `.DS_Store`).
 * - `dir/**` o `dir/` ignora el directorio y todo su contenido, en cualquier nivel si no empieza por `/`.
 * - Las líneas vacías y las que empiezan por `#` se ignoran. `!patrón` re-incluye.
 */
export interface CompiledIgnore {
  test(path: string, isDirectory?: boolean): boolean;
}

interface Rule {
  regex: RegExp;
  negate: boolean;
  dirOnly: boolean;
  basename: boolean;
}

function escapeRegex(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

export function globToRegExpSource(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` = cero o más directorios; `**` final = todo.
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  return out;
}

function compileRule(raw: string): Rule | null {
  let pattern = raw.trim();
  if (!pattern || pattern.startsWith('#')) return null;
  let negate = false;
  if (pattern.startsWith('!')) {
    negate = true;
    pattern = pattern.slice(1);
  }
  let dirOnly = false;
  // `dir/**` → el directorio y su contenido.
  if (pattern.endsWith('/**')) {
    pattern = pattern.slice(0, -3);
    dirOnly = true;
  } else if (pattern.endsWith('/')) {
    pattern = pattern.slice(0, -1);
    dirOnly = true;
  }
  const anchored = pattern.startsWith('/');
  if (anchored) pattern = pattern.slice(1);
  if (!pattern) return null;
  const basename = !anchored && !pattern.includes('/');
  const source = globToRegExpSource(pattern);
  const regex = basename ? new RegExp(`^${source}$`) : new RegExp(`^${anchored ? '' : '(?:.*/)?'}${source}$`);
  return { regex, negate, dirOnly, basename };
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '')
    .replace(/\/+$/, '');
}

export function compileIgnore(patterns: readonly string[]): CompiledIgnore {
  const rules = patterns.map(compileRule).filter((r): r is Rule => r !== null);
  return {
    test(rawPath: string, isDirectory = false): boolean {
      const path = normalizePath(rawPath);
      if (!path) return false;
      const segments = path.split('/');
      let ignored = false;
      for (const rule of rules) {
        let matched = false;
        if (rule.basename) {
          // Cualquier segmento: los directorios ancestros cuentan como directorios.
          for (let i = 0; i < segments.length; i++) {
            const isDirSegment = i < segments.length - 1 || isDirectory;
            if (rule.dirOnly && !isDirSegment) continue;
            if (rule.regex.test(segments[i])) {
              matched = true;
              break;
            }
          }
        } else {
          // Probar la ruta completa y sus prefijos (directorios ancestros).
          for (let i = segments.length; i >= 1; i--) {
            const isDirPrefix = i < segments.length || isDirectory;
            if (rule.dirOnly && !isDirPrefix) continue;
            if (rule.regex.test(segments.slice(0, i).join('/'))) {
              matched = true;
              break;
            }
          }
        }
        if (matched) ignored = !rule.negate;
      }
      return ignored;
    },
  };
}

export function parsePatternList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
