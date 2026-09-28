import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { I18nTitleStrategy } from './core/i18n/title.strategy';
import { routes } from './app.routes';
import { ChatStore } from './core/chat/chat-store.service';
import { ProviderConfigService } from './core/llm/provider-config.service';
import { ProjectService } from './core/projects/project.service';
import { SettingsService } from './core/settings/settings.service';
import { StorageService } from './core/storage/storage.service';
import { provideServiceWorker } from '@angular/service-worker';

/**
 * Arranque: abre IndexedDB (o degrada a memoria) y carga configuración,
 * proveedores, proyectos y chats antes del primer render. Ningún fallo
 * de carga bloquea la app: cada servicio gestiona su propio estado de error.
 */
async function bootstrapData(): Promise<void> {
  const storage = inject(StorageService);
  const settings = inject(SettingsService);
  const providers = inject(ProviderConfigService);
  const projects = inject(ProjectService);
  const chats = inject(ChatStore);
  await storage.init();
  await settings.load();
  await Promise.all([providers.load().catch(() => undefined), projects.load(), chats.load()]);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'disabled' }),
    ),
    { provide: TitleStrategy, useExisting: I18nTitleStrategy },
    provideAppInitializer(bootstrapData),
    provideServiceWorker('sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
