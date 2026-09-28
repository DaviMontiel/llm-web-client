import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { setupStorage } from '../../../../testing/test-helpers';
import { Message } from '../../../core/models';
import { MessageItemComponent } from './message-item.component';

function message(patch: Partial<Message>): Message {
  return {
    id: 'm',
    chatId: 'c',
    parentId: null,
    role: 'assistant',
    content: '',
    attachments: [],
    createdAt: 1,
    updatedAt: 1,
    status: 'complete',
    ...patch,
  };
}

describe('MessageItemComponent', () => {
  async function render(msg: Message, branch: { index: number; count: number } | null = null) {
    TestBed.configureTestingModule({ imports: [MessageItemComponent], providers: [provideRouter([])] });
    setupStorage();
    const fixture = TestBed.createComponent(MessageItemComponent);
    fixture.componentRef.setInput('message', msg);
    fixture.componentRef.setInput('branch', branch);
    await fixture.whenStable();
    return fixture;
  }

  it('renderiza Markdown y bloques de código del asistente', async () => {
    const fixture = await render(message({ content: '**hola**\n\n```ts\nconst a = 1;\n```' }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('strong')?.textContent).toBe('hola');
    expect(el.querySelector('app-code-block')).toBeTruthy();
    expect(el.textContent).toContain('TypeScript');
  });

  it('no ejecuta HTML del modelo', async () => {
    const fixture = await render(message({ content: '<img src=x onerror="window.__xss=1">' }));
    expect((fixture.nativeElement as HTMLElement).querySelector('img')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('muestra el texto del usuario como texto plano', async () => {
    const fixture = await render(message({ role: 'user', content: '<b>no negrita</b>' }));
    const bubble = (fixture.nativeElement as HTMLElement).querySelector('.bubble');
    expect(bubble?.textContent).toBe('<b>no negrita</b>');
    expect(bubble?.querySelector('b')).toBeNull();
  });

  it('edita un mensaje de usuario y emite el nuevo texto', async () => {
    const fixture = await render(message({ role: 'user', content: 'original' }));
    const edits: string[] = [];
    fixture.componentInstance.edit.subscribe((t) => edits.push(t));
    fixture.componentInstance.startEdit();
    await fixture.whenStable();
    const ta = (fixture.nativeElement as HTMLElement).querySelector('textarea.edit-area') as HTMLTextAreaElement;
    ta.value = 'editado';
    ta.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const save = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Guardar y enviar'),
    );
    save?.click();
    expect(edits).toEqual(['editado']);
  });

  it('muestra el error con acción de reintento', async () => {
    const fixture = await render(
      message({ status: 'error', error: { code: 'network', message: 'x', retryable: true } }),
    );
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar con el modelo');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reintentar'))?.click();
    expect(retried).toBe(1);
  });

  it('muestra el selector de ramas', async () => {
    const fixture = await render(message({ content: 'x' }), { index: 1, count: 3 });
    expect((fixture.nativeElement as HTMLElement).querySelector('.branch-count')?.textContent).toBe('2/3');
  });

  it('muestra el indicador de espera durante el streaming sin contenido', async () => {
    const fixture = await render(message({ status: 'streaming' }));
    expect((fixture.nativeElement as HTMLElement).querySelector('.thinking')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('.actions')).toBeNull();
  });
});
