import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { flush, setupStorage } from '../../../../testing/test-helpers';
import { SettingsService } from '../../../core/settings/settings.service';
import { ComposerComponent, ComposerSubmit } from './composer.component';

describe('ComposerComponent', () => {
  let submitted: ComposerSubmit[];
  let resolveSubmit: ((ok: boolean) => void) | null;

  async function setup() {
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [ComposerComponent], providers: [provideRouter([])] });
    setupStorage();
    submitted = [];
    resolveSubmit = null;
    const fixture = TestBed.createComponent(ComposerComponent);
    fixture.componentRef.setInput('draftKey', 'chat-1');
    fixture.componentRef.setInput('submit', (value: ComposerSubmit) => {
      submitted.push(value);
      return new Promise<boolean>((resolve) => (resolveSubmit = resolve));
    });
    await fixture.whenStable();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const type = async (text: string) => {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const key = (init: KeyboardEventInit) =>
      textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    return { fixture, textarea, type, key };
  }

  afterEach(() => sessionStorage.clear());

  it('Enter envía y Shift+Enter no', async () => {
    const { type, key } = await setup();
    await type('hola');
    key({ key: 'Enter', shiftKey: true });
    expect(submitted.length).toBe(0);
    key({ key: 'Enter' });
    expect(submitted).toEqual([{ text: 'hola', attachments: [] }]);
  });

  it('con enterToSend=false solo Ctrl/Cmd+Enter envía', async () => {
    const { fixture, type, key } = await setup();
    TestBed.inject(SettingsService).update({ enterToSend: false });
    await fixture.whenStable();
    await type('hola');
    key({ key: 'Enter' });
    expect(submitted.length).toBe(0);
    key({ key: 'Enter', ctrlKey: true });
    expect(submitted.length).toBe(1);
  });

  it('no envía mensajes vacíos ni dobles mientras se procesa el envío', async () => {
    const { fixture, textarea, type, key } = await setup();
    key({ key: 'Enter' });
    expect(submitted.length).toBe(0);
    await type('uno');
    key({ key: 'Enter' });
    key({ key: 'Enter' });
    expect(submitted.length).toBe(1);
    resolveSubmit?.(true);
    await flush(10);
    await fixture.whenStable();
    expect(textarea.value).toBe('');
  });

  it('conserva el texto si el envío se rechaza', async () => {
    const { fixture, textarea, type, key } = await setup();
    await type('importante');
    key({ key: 'Enter' });
    resolveSubmit?.(false);
    await flush(10);
    await fixture.whenStable();
    expect(textarea.value).toBe('importante');
  });

  it('pegar una imagen crea un adjunto con preview y se puede quitar', async () => {
    const { fixture, textarea } = await setup();
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' });
    const clipboardData = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      files: [file],
      getData: () => '',
    };
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await flush(30);
    await fixture.whenStable();
    const chip = fixture.nativeElement.querySelector('app-attachment-chip');
    expect(chip).toBeTruthy();
    expect(chip.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    (chip.querySelector('button.remove') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-attachment-chip')).toBeNull();
  });

  it('el pegado de texto mantiene el comportamiento normal', async () => {
    const { textarea } = await setup();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { items: [], files: [], getData: () => 'texto' } });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('guarda el borrador por chat', async () => {
    const { fixture, type } = await setup();
    await type('borrador');
    fixture.destroy();
    expect(sessionStorage.getItem('lwc.draft.chat-1')).toBe('borrador');
  });

  it('muestra el botón de detener durante la generación', async () => {
    const { fixture } = await setup();
    let stopped = 0;
    fixture.componentInstance.stop.subscribe(() => stopped++);
    fixture.componentRef.setInput('generating', true);
    await fixture.whenStable();
    const stop = fixture.nativeElement.querySelector('button.stop') as HTMLButtonElement;
    stop.click();
    expect(stopped).toBe(1);
  });
});
