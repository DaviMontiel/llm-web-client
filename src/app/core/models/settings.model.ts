import { ModelRef } from './llm.model';

export type Language = 'es' | 'en';
export type MotionPreference = 'system' | 'full' | 'reduced';

export interface Settings {
  version: 1;
  language: Language;
  themeId: string;
  motion: MotionPreference;
  /** true: Enter envía y Shift+Enter hace salto de línea. false: Ctrl/Cmd+Enter envía. */
  enterToSend: boolean;
  autoScroll: boolean;
  streaming: boolean;
  defaultModel: ModelRef | null;
  temporaryByDefault: boolean;
  /** Instrucciones globales enviadas como system prompt. */
  systemPrompt: string;
  maxOutputTokens: number;
  maxFileSizeMB: number;
  maxFiles: number;
  maxContextKB: number;
  maxMessageChars: number;
  /** Extensiones permitidas para adjuntos (sin punto). Vacío = todas. */
  allowedExtensions: string[];
  ignorePatterns: string[];
  onboarded: boolean;
}

export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'target/**',
  '.angular/**',
  '.next/**',
  '.dart_tool/**',
  '.gradle/**',
  '.idea/**',
  '.vscode/**',
  'coverage/**',
  '__pycache__/**',
  '.venv/**',
  '*.lock',
  'package-lock.json',
  '*.min.js',
  '*.map',
  '*.bin',
  '*.exe',
  '*.dll',
  '.DS_Store',
];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  language: 'es',
  themeId: 'system',
  motion: 'system',
  enterToSend: true,
  autoScroll: true,
  streaming: true,
  defaultModel: null,
  temporaryByDefault: false,
  systemPrompt: '',
  maxOutputTokens: 8192,
  maxFileSizeMB: 20,
  maxFiles: 20,
  maxContextKB: 512,
  maxMessageChars: 100_000,
  allowedExtensions: [],
  ignorePatterns: [...DEFAULT_IGNORE_PATTERNS],
  onboarded: false,
};
