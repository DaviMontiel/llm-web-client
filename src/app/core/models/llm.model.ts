import { Attachment } from './attachment.model';

/** Tipo de API que implementa un proveedor. Determina el adapter a usar. */
export type ProviderKind = 'anthropic' | 'openai' | 'google' | 'openai-compatible';

export interface LLMModelCapabilities {
  text: boolean;
  vision: boolean;
  files: boolean;
  streaming: boolean;
}

export interface LLMModel {
  id: string;
  name: string;
  providerId: string;
  capabilities: LLMModelCapabilities;
  /** Ventana de contexto en tokens, solo si el proveedor la informa o la documenta. */
  contextWindow?: number;
  /** Máximo de tokens de salida, solo si se conoce. */
  maxOutputTokens?: number;
  /** Procedencia del modelo: catálogo incluido, sincronizado desde la API o añadido a mano. */
  origin: 'catalog' | 'synced' | 'custom';
}

/** Definición estática de un proveedor (no incluye secretos). */
export interface LLMProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  description: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  /** Si es un proveedor creado por el usuario (OpenAI-compatible). */
  custom: boolean;
  docsUrl?: string;
  /** Nota sobre CORS / uso desde navegador. */
  browserNote?: string;
  models: LLMModel[];
}

/** Configuración de usuario de un proveedor. */
export interface ProviderConfig {
  providerId: string;
  enabled: boolean;
  apiKey: string;
  /** Si es false, la API key solo vive en memoria durante la sesión. */
  persistApiKey: boolean;
  baseUrl?: string;
  /** Modelos sincronizados o añadidos manualmente. */
  models: LLMModel[];
  /** IDs de modelos del catálogo ocultados por el usuario. */
  hiddenModelIds: string[];
  lastSyncedAt?: number;
}

/** Definición de un proveedor OpenAI-compatible creado por el usuario. */
export interface CustomProviderDefinition {
  id: string;
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
}

export interface ModelRef {
  providerId: string;
  modelId: string;
}

export type ChatRole = 'system' | 'user' | 'assistant';

/** Mensaje normalizado e independiente del proveedor. */
export interface ChatMessage {
  role: Exclude<ChatRole, 'system'>;
  content: string;
  images?: Pick<Attachment, 'mimeType' | 'dataBase64' | 'name'>[];
}

export interface ChatRequest {
  model: LLMModel;
  system?: string;
  messages: ChatMessage[];
  stream: boolean;
  maxOutputTokens: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type ChatStreamEvent =
  { type: 'token'; text: string } | { type: 'usage'; usage: TokenUsage } | { type: 'complete'; stopReason?: string };

export interface ConnectionInfo {
  provider: LLMProvider;
  config: ProviderConfig;
  baseUrl: string;
}
