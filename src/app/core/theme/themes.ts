/**
 * Registro de temas. Los colores viven en `src/styles/themes.css`
 * bajo `[data-theme="<id>"]`. Para añadir un tema:
 *  1. Añade un bloque CSS con todas las variables.
 *  2. Añade aquí su definición (id, claves i18n, esquema y colores de preview)
 *     y las claves `theme.<id>.name` / `theme.<id>.desc` en los diccionarios i18n.
 */
import { TranslationKey } from '../i18n/es';

export interface ThemeDefinition {
  id: string;
  /** Clave i18n del nombre y la descripción. */
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  scheme: 'light' | 'dark' | 'system';
  preview: { background: string; surface: string; foreground: string; accent: string };
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'system',
    nameKey: 'theme.system.name',
    descriptionKey: 'theme.system.desc',
    scheme: 'system',
    preview: { background: '#fbfbfa', surface: '#1b1b1d', foreground: '#6b6b70', accent: '#2f6fed' },
  },
  {
    id: 'light',
    nameKey: 'theme.light.name',
    descriptionKey: 'theme.light.desc',
    scheme: 'light',
    preview: { background: '#fbfbfa', surface: '#ffffff', foreground: '#1d1d1f', accent: '#2f6fed' },
  },
  {
    id: 'dark',
    nameKey: 'theme.dark.name',
    descriptionKey: 'theme.dark.desc',
    scheme: 'dark',
    preview: { background: '#1b1b1d', surface: '#232326', foreground: '#ececee', accent: '#6b9bff' },
  },
  {
    id: 'claude',
    nameKey: 'theme.claude.name',
    descriptionKey: 'theme.claude.desc',
    scheme: 'light',
    preview: { background: '#f8f6f1', surface: '#fffdf9', foreground: '#2b2a27', accent: '#c2643f' },
  },
  {
    id: 'chatgpt',
    nameKey: 'theme.chatgpt.name',
    descriptionKey: 'theme.chatgpt.desc',
    scheme: 'dark',
    preview: { background: '#212121', surface: '#2f2f2f', foreground: '#ececec', accent: '#10a37f' },
  },
  {
    id: 'gemini',
    nameKey: 'theme.gemini.name',
    descriptionKey: 'theme.gemini.desc',
    scheme: 'light',
    preview: { background: '#ffffff', surface: '#f0f4f9', foreground: '#1f1f1f', accent: '#0b57d0' },
  },
  {
    id: 'midnight',
    nameKey: 'theme.midnight.name',
    descriptionKey: 'theme.midnight.desc',
    scheme: 'dark',
    preview: { background: '#0e1117', surface: '#151a23', foreground: '#e6e8ef', accent: '#8b7cff' },
  },
];

export function findTheme(id: string): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
