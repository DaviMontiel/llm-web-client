import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { dragHasFiles } from '../../core/filesystem/clipboard';
import { captureDropEntries, collectDroppedFiles } from '../../core/filesystem/drop';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { SettingsService } from '../../core/settings/settings.service';
import { ComposerBridgeService } from '../../core/ui/composer-bridge.service';
import { ToastService } from '../../core/ui/toast.service';
import { compileIgnore } from '../../core/utils/glob';
import { IconComponent } from '../../shared/components/icon/icon.component';

/** Capa global de "Suelta los archivos aquí". Admite archivos y carpetas. */
@Component({
  selector: 'app-drop-overlay',
  imports: [IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:dragenter)': 'onDragEnter($event)',
    '(window:dragover)': 'onDragOver($event)',
    '(window:dragleave)': 'onDragLeave($event)',
    '(window:drop)': 'onDrop($event)',
  },
  template: `
    @if (active()) {
      <div class="overlay" animate.enter="anim-fade-in" animate.leave="anim-fade-out" aria-hidden="true">
        <div class="zone">
          <div class="icon"><app-icon name="upload" [size]="22" /></div>
          <p class="title">{{ 'drop.title' | t }}</p>
          <p class="hint">{{ 'drop.hint' | t }}</p>
        </div>
      </div>
    }
  `,
  styles: `
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 150;
      display: grid;
      place-items: center;
      padding: 24px;
      background: color-mix(in srgb, var(--background) 72%, transparent);
      backdrop-filter: blur(3px);
      pointer-events: none;
    }
    .zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: min(520px, 100%);
      height: min(300px, 60vh);
      border: 1.5px dashed var(--accent);
      border-radius: var(--radius-xl);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      animation: pop-in var(--dur-slow) var(--ease-out);
    }
    .icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      margin-bottom: 6px;
      border-radius: 14px;
      background: var(--accent-soft);
      color: var(--accent);
      animation: rise-in 600ms var(--ease-out) infinite alternate;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
    }
    .hint {
      font-size: 13px;
      color: var(--muted);
    }
  `,
})
export class DropOverlayComponent {
  private readonly bridge = inject(ComposerBridgeService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly active = signal(false);
  private depth = 0;

  protected onDragEnter(event: DragEvent): void {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    this.depth++;
    if (this.bridge.available()) this.active.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    if (!dragHasFiles(event)) return;
    // Siempre se previene: evita que el navegador abra el archivo y abandone la app.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.bridge.available() ? 'copy' : 'none';
  }

  protected onDragLeave(event: DragEvent): void {
    if (!dragHasFiles(event)) return;
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.active.set(false);
  }

  protected onDrop(event: DragEvent): void {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    this.depth = 0;
    this.active.set(false);
    if (!this.bridge.available()) return;
    const entries = captureDropEntries(event.dataTransfer);
    const s = this.settings.settings();
    void collectDroppedFiles(entries, compileIgnore(s.ignorePatterns), s.maxFiles).then((result) => {
      if (result.truncated) this.toast.warning(this.i18n.t('error.tooManyFiles', { max: s.maxFiles }));
      const withPath = result.files.filter((f) => f.path);
      this.bridge.addFiles(
        result.files.map((f) => f.file),
        withPath.length ? 'folder' : 'drop',
        result.files.map((f) => f.path ?? ''),
      );
    });
  }
}
