import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { AppError, ChatMessage, ChatStreamEvent, ConnectionInfo, LLMModel, ModelRef, ProviderKind } from '../models';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GoogleAdapter } from './adapters/google.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible.adapter';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { LLMAdapter } from './llm-adapter';
import { ProviderConfigService } from './provider-config.service';

export interface GenerateOptions {
  model: ModelRef;
  system?: string;
  messages: ChatMessage[];
  stream: boolean;
  maxOutputTokens: number;
}

/**
 * Punto único de entrada a los LLM. Resuelve proveedor + modelo +
 * credenciales y delega en el adapter correspondiente. Los componentes
 * nunca conocen los detalles de cada API.
 */
@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly providers = inject(ProviderConfigService);
  private readonly adapters = new Map<ProviderKind, LLMAdapter>();

  constructor() {
    this.registerAdapter(new AnthropicAdapter());
    this.registerAdapter(new OpenAIAdapter());
    this.registerAdapter(new GoogleAdapter());
    this.registerAdapter(new OpenAICompatibleAdapter());
  }

  /** Permite registrar (o sustituir, p. ej. en tests) un adapter. */
  registerAdapter(adapter: LLMAdapter): void {
    this.adapters.set(adapter.kind, adapter);
  }

  connection(providerId: string): ConnectionInfo {
    const provider = this.providers.provider(providerId);
    if (!provider) throw new AppError('not_configured', 'Unknown provider');
    if (!this.providers.isConfigured(providerId)) throw new AppError('not_configured', 'Provider not configured');
    return { provider, config: this.providers.config(providerId), baseUrl: this.providers.baseUrl(providerId) };
  }

  resolveModel(ref: ModelRef | null | undefined): LLMModel | null {
    return this.providers.findModel(ref)?.model ?? null;
  }

  generate(options: GenerateOptions): Observable<ChatStreamEvent> {
    try {
      const connection = this.connection(options.model.providerId);
      const model = this.resolveModel(options.model);
      if (!model) throw new AppError('not_configured', 'Unknown model');
      const adapter = this.adapters.get(connection.provider.kind);
      if (!adapter) throw new AppError('unsupported', 'No adapter for provider');
      return adapter.send(
        {
          model,
          system: options.system,
          messages: options.messages,
          stream: options.stream && model.capabilities.streaming,
          maxOutputTokens: options.maxOutputTokens,
        },
        connection,
      );
    } catch (error) {
      return throwError(() => error);
    }
  }

  async listModels(providerId: string, signal?: AbortSignal): Promise<LLMModel[]> {
    const connection = this.connection(providerId);
    const adapter = this.adapters.get(connection.provider.kind);
    if (!adapter) throw new AppError('unsupported', 'No adapter for provider');
    return adapter.listModels(connection, signal);
  }

  /** Sincroniza la lista de modelos desde la API y la guarda. Devuelve el número obtenido. */
  async syncModels(providerId: string): Promise<number> {
    const models = await this.listModels(providerId);
    this.providers.setSyncedModels(providerId, models);
    return models.length;
  }
}
