import { compileIgnore, globToRegExpSource, parsePatternList } from './glob';

describe('compileIgnore', () => {
  const ignore = compileIgnore([
    'node_modules/**',
    '.git/**',
    'dist/',
    '*.lock',
    '*.bin',
    '/build',
    'src/generated/**',
    '!keep.lock',
  ]);

  it('ignora directorios en cualquier nivel', () => {
    expect(ignore.test('node_modules', true)).toBe(true);
    expect(ignore.test('node_modules/react/index.js')).toBe(true);
    expect(ignore.test('packages/a/node_modules/x.js')).toBe(true);
    expect(ignore.test('.git/HEAD')).toBe(true);
    expect(ignore.test('dist/main.js')).toBe(true);
  });

  it('no confunde archivos con directorios de patrones dir-only', () => {
    expect(ignore.test('dist', false)).toBe(false);
    expect(ignore.test('src/dist.ts')).toBe(false);
  });

  it('aplica patrones de extensión sobre el nombre', () => {
    expect(ignore.test('yarn.lock')).toBe(true);
    expect(ignore.test('assets/model.bin')).toBe(true);
    expect(ignore.test('src/app.ts')).toBe(false);
  });

  it('respeta anclaje a la raíz', () => {
    expect(ignore.test('build/out.js')).toBe(true);
    expect(ignore.test('tools/build/out.js')).toBe(false);
  });

  it('admite rutas con subdirectorios y negaciones', () => {
    expect(ignore.test('src/generated/api.ts')).toBe(true);
    expect(ignore.test('src/app/api.ts')).toBe(false);
    expect(ignore.test('keep.lock')).toBe(false);
  });

  it('normaliza separadores de Windows', () => {
    expect(ignore.test('node_modules\\a\\b.js')).toBe(true);
  });
});

describe('glob helpers', () => {
  it('convierte ** y * correctamente', () => {
    const re = new RegExp(`^${globToRegExpSource('src/**/*.ts')}$`);
    expect(re.test('src/a.ts')).toBe(true);
    expect(re.test('src/a/b/c.ts')).toBe(true);
    expect(re.test('src/a/b/c.js')).toBe(false);
  });

  it('parsea listas ignorando líneas vacías', () => {
    expect(parsePatternList('a\n\n  b  \r\nc')).toEqual(['a', 'b', 'c']);
  });
});
