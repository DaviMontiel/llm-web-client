import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/** Solo se registran lenguajes habituales en programación para contener el bundle. */
const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  makefile,
  markdown,
  php,
  plaintext,
  powershell,
  python,
  ruby,
  rust,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};
for (const [name, lang] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, lang);
hljs.registerAliases(['ts', 'tsx', 'mts', 'cts'], { languageName: 'typescript' });
hljs.registerAliases(['js', 'jsx', 'mjs', 'cjs'], { languageName: 'javascript' });
hljs.registerAliases(['html', 'htm', 'svg', 'vue', 'angular'], { languageName: 'xml' });
hljs.registerAliases(['sh', 'zsh', 'console'], { languageName: 'bash' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['kt', 'kts'], { languageName: 'kotlin' });
hljs.registerAliases(['rs'], { languageName: 'rust' });
hljs.registerAliases(['cs'], { languageName: 'csharp' });
hljs.registerAliases(['patch'], { languageName: 'diff' });
hljs.registerAliases(['md'], { languageName: 'markdown' });
hljs.registerAliases(['ps1'], { languageName: 'powershell' });
hljs.registerAliases(['toml', 'env', 'properties'], { languageName: 'ini' });
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' });

const DISPLAY_NAMES: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  xml: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  python: 'Python',
  bash: 'Bash',
  shell: 'Shell',
  dart: 'Dart',
  java: 'Java',
  kotlin: 'Kotlin',
  go: 'Go',
  rust: 'Rust',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  sql: 'SQL',
  yaml: 'YAML',
  markdown: 'Markdown',
  diff: 'Diff',
  php: 'PHP',
  ruby: 'Ruby',
  swift: 'Swift',
  dockerfile: 'Dockerfile',
  ini: 'INI',
  graphql: 'GraphQL',
  makefile: 'Makefile',
  powershell: 'PowerShell',
  plaintext: 'Text',
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface HighlightResult {
  /** HTML generado por highlight.js: solo `<span class="hljs-…">` con texto escapado. */
  html: string;
  language: string | null;
}

const AUTO_DETECT_MAX = 4000;
const HIGHLIGHT_MAX = 200_000;

/** Nombre canónico de un lenguaje (resuelve alias) o null si no está registrado. */
export function resolveLanguage(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const clean = lang
    .trim()
    .toLowerCase()
    .split(/[\s{:]/)[0];
  const def = hljs.getLanguage(clean);
  if (!def) return null;
  const canonical = Object.keys(LANGUAGES).find((k) => hljs.getLanguage(k) === def);
  return canonical ?? clean;
}

export function languageLabel(lang: string | null | undefined, fallback = 'Code'): string {
  const resolved = resolveLanguage(lang);
  if (resolved) return DISPLAY_NAMES[resolved] ?? resolved;
  return lang?.trim() ? lang.trim() : fallback;
}

export function highlightCode(code: string, lang: string | null | undefined): HighlightResult {
  if (code.length > HIGHLIGHT_MAX) return { html: escapeHtml(code), language: resolveLanguage(lang) };
  const language = resolveLanguage(lang);
  try {
    if (language) return { html: hljs.highlight(code, { language, ignoreIllegals: true }).value, language };
    if (!lang && code.length <= AUTO_DETECT_MAX) {
      const auto = hljs.highlightAuto(
        code,
        Object.keys(LANGUAGES).filter((l) => l !== 'plaintext'),
      );
      if (auto.relevance >= 5 && auto.language) return { html: auto.value, language: auto.language };
    }
  } catch {
    /* fallback a texto escapado */
  }
  return { html: escapeHtml(code), language };
}
