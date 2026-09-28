import { Chat, Message } from '../models';
import { createId } from '../utils/id';

/**
 * Conversación de DEMOSTRACIÓN para ver el renderizado (Markdown, código,
 * tablas, diffs) sin configurar un proveedor. Contenido estático escrito a
 * mano, claramente etiquetado: no simula un modelo ni se usa para responder.
 * Solo se carga si el usuario lo pide en Configuración → Datos.
 */
export function createDemoConversation(title: string): { chat: Chat; messages: Message[] } {
  const now = Date.now();
  const chatId = createId();
  const userId = createId();
  const assistantId = createId();
  const user: Message = {
    id: userId,
    chatId,
    parentId: null,
    role: 'user',
    content:
      '¿Cómo muestro los mensajes de un chat con signals en Angular sin re-renderizar toda la lista en cada token?',
    attachments: [],
    createdAt: now - 60_000,
    updatedAt: now - 60_000,
    status: 'complete',
  };
  const assistant: Message = {
    id: assistantId,
    chatId,
    parentId: userId,
    role: 'assistant',
    content: [
      '> **Contenido de demostración** — texto estático incluido en la aplicación para mostrar el renderizado. No lo ha generado ningún modelo.',
      '',
      'La clave es que **solo cambie la referencia del mensaje que se está generando**. Con `@for` y `track m.id`, Angular reutiliza el resto de componentes.',
      '',
      '```typescript src/app/chat/message-list.ts',
      "import { ChangeDetectionStrategy, Component, input } from '@angular/core';",
      '',
      '@Component({',
      "  selector: 'app-message-list',",
      '  changeDetection: ChangeDetectionStrategy.OnPush,',
      '  template: `',
      '    @for (m of messages(); track m.id) {',
      '      <app-message [message]="m" />',
      '    }',
      '  `,',
      '})',
      'export class MessageListComponent {',
      '  readonly messages = input.required<Message[]>();',
      '}',
      '```',
      '',
      '### Comparativa',
      '',
      '| Estrategia | Coste por token | Complejidad |',
      '| --- | --- | --- |',
      '| Recalcular toda la lista | O(n) renders | Baja |',
      '| Signal por mensaje + `track` | O(1) renders | Media |',
      '',
      'Un cambio típico sería:',
      '',
      '```diff',
      '- messages.set([...messages(), token]);',
      '+ messages.update((list) => list.map((m) => (m.id === id ? { ...m, content } : m)));',
      '```',
      '',
      '1. Acumula los tokens en un buffer.',
      '2. Vuelca el buffer **una vez por frame** con `requestAnimationFrame`.',
      '3. Persiste en IndexedDB con *throttle*.',
    ].join('\n'),
    attachments: [],
    createdAt: now - 55_000,
    updatedAt: now - 55_000,
    status: 'complete',
    modelName: 'Demo (estático)',
  };
  const chat: Chat = {
    id: chatId,
    title,
    createdAt: now - 60_000,
    updatedAt: now - 55_000,
    projectId: null,
    model: null,
    temporary: false,
    favorite: false,
    activeLeafId: assistantId,
    titleLocked: true,
    context: { files: [], includeInstructions: true },
  };
  return { chat, messages: [user, assistant] };
}
