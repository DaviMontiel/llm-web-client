import { LLMModel, LLMProvider } from '../models';

/**
 * Catálogo inicial de proveedores y modelos.
 *
 * Los IDs de modelo se tomaron de la documentación oficial de cada
 * proveedor (septiembre de 2026). Los modelos cambian con frecuencia:
 * usa "Sincronizar modelos" en Configuración → Modelos para obtener la
 * lista real de tu cuenta desde la API del proveedor. Solo se indican
 * ventanas de contexto cuando la documentación las publica.
 */
function model(
  providerId: string,
  id: string,
  name: string,
  extra: Partial<Pick<LLMModel, 'contextWindow' | 'maxOutputTokens'>> & { vision?: boolean } = {},
): LLMModel {
  return {
    id,
    name,
    providerId,
    capabilities: { text: true, vision: extra.vision ?? true, files: true, streaming: true },
    contextWindow: extra.contextWindow,
    maxOutputTokens: extra.maxOutputTokens,
    origin: 'catalog',
  };
}

export const BUILTIN_PROVIDERS: readonly LLMProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    description: 'Claude · Messages API',
    defaultBaseUrl: 'https://api.anthropic.com',
    requiresApiKey: true,
    custom: false,
    docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    browserNote: 'cors.anthropic',
    models: [
      model('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', { contextWindow: 1_000_000, maxOutputTokens: 128_000 }),
      model('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', { contextWindow: 1_000_000, maxOutputTokens: 128_000 }),
      model('anthropic', 'claude-fable-5-1', 'Claude Fable 5.1', {
        contextWindow: 1_000_000,
        maxOutputTokens: 128_000,
      }),
      model('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', {
        contextWindow: 200_000,
        maxOutputTokens: 64_000,
      }),
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    description: 'GPT · Responses API',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    custom: false,
    docsUrl: 'https://developers.openai.com/api/docs/models',
    browserNote: 'cors.openai',
    models: [
      model('openai', 'gpt-6-astra', 'GPT-6 Astra', { contextWindow: 1_050_000 }),
      model('openai', 'gpt-6-sol', 'GPT-6 Sol', { contextWindow: 1_050_000 }),
      model('openai', 'gpt-6-luna', 'GPT-6 Luna', { contextWindow: 1_050_000 }),
    ],
  },
  {
    id: 'google',
    name: 'Google',
    kind: 'google',
    description: 'Gemini · Gemini API',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresApiKey: true,
    custom: false,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    browserNote: 'cors.google',
    models: [
      model('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash'),
      model('google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)'),
      model('google', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'),
    ],
  },
];

/** Plantillas para crear proveedores OpenAI-compatible. */
export interface CompatiblePreset {
  id: string;
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
}

export const COMPATIBLE_PRESETS: readonly CompatiblePreset[] = [
  { id: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', requiresApiKey: false },
  { id: 'lmstudio', name: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', requiresApiKey: false },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', requiresApiKey: true },
  { id: 'custom', name: 'Personalizado', baseUrl: 'https://', requiresApiKey: true },
];
