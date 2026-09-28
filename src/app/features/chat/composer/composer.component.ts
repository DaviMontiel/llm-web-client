import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { AttachmentService } from '../../../core/filesystem/attachment.service';
import { extractClipboardFiles, readClipboardImages } from '../../../core/filesystem/clipboard';
import { browserSupport, pickFiles } from '../../../core/filesystem/fs-support';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { ProviderConfigService } from '../../../core/llm/provider-config.service';
import { AppError, Attachment, AttachmentSource, ModelRef, PendingAttachment } from '../../../core/models';
import { SettingsService } from '../../../core/settings/settings.service';
import { ComposerBridgeService } from '../../../core/ui/composer-bridge.service';
import { MenuItem, MenuService } from '../../../core/ui/menu.service';
import { ToastService } from '../../../core/ui/toast.service';
import { compileIgnore } from '../../../core/utils/glob';
import { createId } from '../../../core/utils/id';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { SwitchComponent } from '../../../shared/components/switch/switch.component';
import { AutosizeDirective } from '../../../shared/directives/autosize.directive';
import { ModelPickerComponent } from '../model-picker/model-picker.component';
import { AttachmentChipComponent } from './attachment-chip.component';

export interface ComposerSubmit {
  text: string;
  attachments: Attachment[];
}

const DRAFT_PREFIX = 'lwc.draft.';

/**
 * Barra de prompt: textarea autoexpandible, adjuntos (subida, carpeta,
 * drag & drop, pegar imágenes), selector de modelo y enviar/detener.
 */
@Component({
  selector: 'app-composer',
  imports: [IconComponent, TPipe, AutosizeDirective, AttachmentChipComponent, ModelPickerComponent, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './composer.component.html',
  styleUrl: './composer.component.css',
})
export class ComposerComponent {
  private readonly attachmentsService = inject(AttachmentService);
  private readonly settings = inject(SettingsService);
  private readonly providers = inject(ProviderConfigService);
  private readonly bridge = inject(ComposerBridgeService);
  private readonly menu = inject(MenuService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  /** Clave para guardar el borrador (id del chat). */
  readonly draftKey = input<string>('');
  readonly generating = input(false);
  readonly model = input<ModelRef | null>(null);
  readonly temporary = input(false);
  readonly showTemporaryToggle = input(false);
  readonly placeholder = input('');
  /** Envía el mensaje; debe resolver true si se aceptó (evita dobles envíos). */
  readonly submit = input.required<(value: ComposerSubmit) => Promise<boolean>>();

  readonly stop = output<void>();
  readonly modelChange = output<ModelRef>();
  readonly temporaryChange = output<boolean>();
  readonly editLast = output<void>();
  /** Abre el panel lateral: selección de proyecto/contexto o explorador de archivos. */
  readonly openPanel = output<'context' | 'files'>();

  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
  private readonly autosize = viewChild(AutosizeDirective);

  protected readonly text = signal('');
  protected readonly pending = signal<PendingAttachment[]>([]);
  protected readonly submitting = signal(false);
  protected readonly focused = signal(false);

  protected readonly limits = computed(() => this.settings.settings());
  protected readonly enterToSend = computed(() => this.settings.settings().enterToSend);
  protected readonly processing = computed(() => this.pending().some((p) => p.status === 'processing'));
  protected readonly readyAttachments = computed(() =>
    this.pending()
      .filter((p) => p.status === 'ready' && p.attachment)
      .map((p) => p.attachment as Attachment),
  );
  protected readonly charCount = computed(() => this.text().length);
  protected readonly overLimit = computed(() => this.charCount() > this.limits().maxMessageChars);
  protected readonly showCounter = computed(() => this.charCount() > this.limits().maxMessageChars * 0.8);
  protected readonly modelInfo = computed(() => this.providers.findModel(this.model()));
  protected readonly visionWarning = computed(
    () =>
      this.readyAttachments().some((a) => a.kind === 'image') &&
      this.modelInfo() !== null &&
      !this.modelInfo()?.model.capabilities.vision,
  );
  protected readonly canSend = computed(
    () =>
      !this.generating() &&
      !this.submitting() &&
      !this.processing() &&
      !this.overLimit() &&
      (this.text().trim().length > 0 || this.readyAttachments().length > 0),
  );
  protected readonly isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  constructor() {
    const unregister = this.bridge.register();
    const subs = [
      this.bridge.files$.subscribe(({ files, source, paths }) => void this.addFiles(files, source, paths)),
      this.bridge.insertText$.subscribe((t) => this.insertText(t)),
      this.bridge.focus$.subscribe(() => this.focus()),
      this.bridge.removePending$.subscribe((id) => this.removeAttachment(id)),
    ];
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      unregister();
      subs.forEach((s) => s.unsubscribe());
      this.saveDraft();
      this.bridge.pending.set([]);
    });

    effect(() => this.bridge.pending.set(this.pending()));

    // Cambio de chat: guardar el borrador anterior y cargar el nuevo.
    let previousKey = '';
    effect(() => {
      const key = this.draftKey();
      untracked(() => {
        if (previousKey && previousKey !== key) this.saveDraft(previousKey);
        previousKey = key;
        this.text.set(this.loadDraft(key));
        this.pending.set([]);
        setTimeout(() => {
          this.autosize()?.resize();
          this.focus();
        });
      });
    });
  }

  focus(): void {
    const ta = this.textarea()?.nativeElement;
    if (!ta) return;
    // En pantallas táctiles no se fuerza el teclado virtual.
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return;
    ta.focus();
  }

  protected onInput(value: string): void {
    this.text.set(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      const mod = event.metaKey || event.ctrlKey;
      const send = this.enterToSend() ? !event.shiftKey && !mod : mod;
      if (send) {
        event.preventDefault();
        void this.send();
      }
      return;
    }
    if (event.key === 'ArrowUp' && !this.text() && this.pending().length === 0) {
      event.preventDefault();
      this.editLast.emit();
    }
    if (event.key === 'Escape' && this.generating()) {
      event.preventDefault();
      this.stop.emit();
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const { files, consume } = extractClipboardFiles(event.clipboardData);
    if (!consume) return; // pegado de texto normal
    event.preventDefault();
    void this.addFiles(files, 'paste');
  }

  async send(): Promise<void> {
    if (!this.canSend()) return;
    this.submitting.set(true);
    const value: ComposerSubmit = { text: this.text().trim(), attachments: this.readyAttachments() };
    try {
      const ok = await this.submit()(value);
      if (ok) {
        this.text.set('');
        this.pending.set([]);
        this.clearDraft(this.draftKey());
        setTimeout(() => this.autosize()?.resize());
      }
    } finally {
      this.submitting.set(false);
    }
  }

  // ------------------------------------------------------------- adjuntos

  protected openAttachMenu(event: MouseEvent): void {
    const items: MenuItem[] = [
      { id: 'file', label: this.i18n.t('composer.uploadFile'), icon: 'paperclip', run: () => void this.pick({}) },
      {
        id: 'image',
        label: this.i18n.t('composer.uploadImages'),
        icon: 'image',
        run: () => void this.pick({ accept: 'image/png,image/jpeg,image/gif,image/webp' }),
      },
      {
        id: 'folder',
        label: this.i18n.t('composer.uploadFolder'),
        icon: 'folder-plus',
        disabled: !browserSupport.directoryUpload(),
        run: () => void this.pick({ directory: true }),
      },
    ];
    if (browserSupport.clipboardRead()) {
      items.push({
        id: 'paste',
        label: this.i18n.t('composer.pasteImage'),
        icon: 'clipboard-paste',
        run: () => void this.pasteFromClipboard(),
      });
    }
    items.push(
      {
        id: 'project',
        label: this.i18n.t('project.select'),
        icon: 'folder-open',
        separatorBefore: true,
        run: () => this.openPanel.emit('context'),
      },
      {
        id: 'files',
        label: this.i18n.t('composer.projectFiles'),
        icon: 'folder-tree',
        run: () => this.openPanel.emit('files'),
      },
    );
    this.menu.toggleAt(event.currentTarget as HTMLElement, items, this.i18n.t('composer.attach'), 'start');
  }

  private async pick(options: { accept?: string; directory?: boolean }): Promise<void> {
    const files = await pickFiles({ multiple: true, ...options });
    if (!files.length) return;
    if (options.directory) {
      const ignore = compileIgnore(this.settings.settings().ignorePatterns);
      const kept: File[] = [];
      const paths: string[] = [];
      for (const f of files) {
        const rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
        const inner = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel;
        if (ignore.test(inner)) continue;
        kept.push(f);
        paths.push(rel);
      }
      await this.addFiles(kept, 'folder', paths);
    } else {
      await this.addFiles(files, 'upload');
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const files = await readClipboardImages();
      if (files.length) await this.addFiles(files, 'paste');
      else this.toast.info(this.i18n.t('composer.clipboardEmpty'));
    } catch {
      this.toast.error(this.i18n.t('composer.clipboardDenied'));
    }
  }

  async addFiles(files: readonly File[], source: AttachmentSource, paths?: readonly string[]): Promise<void> {
    if (!files.length) return;
    const max = this.settings.settings().maxFiles;
    const available = max - this.pending().length;
    if (available <= 0) {
      this.toast.error(this.i18n.t('error.tooManyFiles', { max }));
      return;
    }
    if (files.length > available) this.toast.warning(this.i18n.t('error.tooManyFiles', { max }));
    const accepted = files.slice(0, available);
    const entries = accepted.map<PendingAttachment>((f) => ({
      id: createId(),
      name: f.name,
      size: f.size,
      status: 'processing',
    }));
    this.pending.update((list) => [...list, ...entries]);

    let failures = 0;
    await Promise.all(
      accepted.map(async (file, i) => {
        const id = entries[i].id;
        const path = paths?.[i] || undefined;
        try {
          const attachment = await this.attachmentsService.process(file, { source, path });
          this.updatePending(id, { status: 'ready', attachment, name: attachment.name });
        } catch (error) {
          failures++;
          const message =
            error instanceof AppError ? error.message : this.i18n.t('error.fileRead', { name: file.name });
          this.updatePending(id, { status: 'error', error: message });
        }
      }),
    );
    if (failures === 1) {
      const failed = this.pending().find((p) => p.status === 'error' && entries.some((e) => e.id === p.id));
      this.toast.error(failed?.error ?? this.i18n.t('error.fileRead', { name: '' }));
    } else if (failures > 1) {
      this.toast.error(this.i18n.t('error.filesFailed', { n: failures }));
    }
  }

  private updatePending(id: string, patch: Partial<PendingAttachment>): void {
    this.pending.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  protected removeAttachment(id: string): void {
    this.pending.update((list) => list.filter((p) => p.id !== id));
    this.focus();
  }

  insertText(value: string): void {
    const ta = this.textarea()?.nativeElement;
    const current = this.text();
    if (!ta) {
      this.text.set(current ? `${current}\n${value}` : value);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + value + current.slice(end);
    this.text.set(next);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + value.length;
      this.autosize()?.resize();
    });
  }

  /** Rellena el composer (p. ej. sugerencias de la pantalla de bienvenida). */
  setText(value: string): void {
    this.text.set(value);
    setTimeout(() => {
      this.autosize()?.resize();
      this.focus();
    });
  }

  // -------------------------------------------------------------- borrador

  private loadDraft(key: string): string {
    if (!key) return '';
    try {
      return sessionStorage.getItem(DRAFT_PREFIX + key) ?? '';
    } catch {
      return '';
    }
  }

  private saveDraft(key = this.draftKey()): void {
    if (!key) return;
    try {
      const text = this.text();
      if (text.trim()) sessionStorage.setItem(DRAFT_PREFIX + key, text);
      else sessionStorage.removeItem(DRAFT_PREFIX + key);
    } catch {
      /* sin sessionStorage */
    }
  }

  private clearDraft(key: string): void {
    try {
      sessionStorage.removeItem(DRAFT_PREFIX + key);
    } catch {
      /* sin sessionStorage */
    }
  }
}
