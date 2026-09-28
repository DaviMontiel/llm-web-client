import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AttachmentService } from '../../../core/filesystem/attachment.service';
import { TPipe } from '../../../core/i18n/t.pipe';
import { Attachment, PendingAttachment } from '../../../core/models';
import { fileExtension } from '../../../core/utils/format';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IconName } from '../../../shared/components/icon/icons';
import { FileSizePipe } from '../../../shared/pipes/format.pipes';

/** Chip de adjunto: miniatura o icono, nombre, extensión, tamaño y estado. */
@Component({
  selector: 'app-attachment-chip',
  imports: [IconComponent, TPipe, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chip" [class.is-error]="status() === 'error'" [class.is-image]="!!preview()" [title]="tooltip()">
      <div class="thumb">
        @if (preview(); as src) {
          <img [src]="src" [alt]="name()" loading="lazy" decoding="async" />
        } @else if (status() === 'processing') {
          <app-icon name="loader-circle" [size]="16" class="spin" />
        } @else {
          <app-icon [name]="icon()" [size]="16" />
        }
      </div>
      <div class="meta">
        <span class="name">{{ name() }}</span>
        <span class="sub">
          @if (status() === 'error') {
            {{ errorText() }}
          } @else if (status() === 'processing') {
            {{ 'attachment.processing' | t }}
          } @else {
            {{ ext() }}{{ ext() ? ' · ' : '' }}{{ size() | fileSize }}
            @if (attachment()?.kind === 'binary') {
              · {{ 'attachment.binary' | t }}
            }
            @if (attachment()?.truncated) {
              · {{ 'attachment.truncated' | t }}
            }
          }
        </span>
      </div>
      @if (removable()) {
        <button
          type="button"
          class="remove"
          (click)="removed.emit()"
          [attr.aria-label]="'attachment.remove' | t: { name: name() }"
        >
          <app-icon name="x" [size]="12" />
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
      animation: pop-in var(--dur) var(--ease-out);
    }
    .chip {
      position: relative;
      display: flex;
      align-items: center;
      gap: 9px;
      width: 220px;
      max-width: 100%;
      height: 52px;
      padding: 6px 28px 6px 6px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
    }
    .chip.is-error {
      border-color: color-mix(in srgb, var(--danger) 40%, transparent);
      background: var(--danger-soft);
    }
    .thumb {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex-shrink: 0;
      overflow: hidden;
      border-radius: 7px;
      background: var(--surface-2);
      color: var(--muted);
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .is-error .thumb {
      color: var(--danger);
    }
    .meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-size: 12.5px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sub {
      font-size: 11.5px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .is-error .sub {
      color: var(--danger);
    }
    .remove {
      position: absolute;
      top: 5px;
      right: 5px;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--surface-active);
      color: var(--muted);
      opacity: 0.85;
      transition:
        opacity var(--dur-fast),
        background var(--dur-fast);
    }
    .remove:hover {
      opacity: 1;
      color: var(--foreground);
    }
  `,
})
export class AttachmentChipComponent {
  readonly pending = input<PendingAttachment | null>(null);
  readonly sent = input<Attachment | null>(null);
  readonly removable = input(true);
  readonly removed = output<void>();

  protected readonly attachment = computed(() => this.sent() ?? this.pending()?.attachment ?? null);
  protected readonly status = computed(() => this.pending()?.status ?? 'ready');
  protected readonly name = computed(
    () => this.attachment()?.path ?? this.attachment()?.name ?? this.pending()?.name ?? '',
  );
  protected readonly size = computed(() => this.attachment()?.size ?? this.pending()?.size ?? 0);
  protected readonly ext = computed(() =>
    fileExtension(this.attachment()?.name ?? this.pending()?.name ?? '').toUpperCase(),
  );
  protected readonly preview = computed(() => {
    const a = this.attachment();
    return a ? AttachmentService.previewUrl(a) : null;
  });
  protected readonly errorText = computed(() => this.pending()?.error ?? '');
  protected readonly tooltip = computed(() => {
    const a = this.attachment();
    if (a?.width && a.height) return `${this.name()} · ${a.width}×${a.height}`;
    return this.name();
  });
  protected readonly icon = computed<IconName>(() => {
    const a = this.attachment();
    if (this.status() === 'error') return 'circle-alert';
    if (!a) return 'file';
    if (a.kind === 'image') return 'image';
    if (a.kind === 'text')
      return /\.(ts|js|py|java|kt|go|rs|c|cpp|cs|dart|html|css|scss|json|ya?ml|sh|sql|php|rb|swift)$/i.test(a.name)
        ? 'file-code'
        : 'file-text';
    return 'file';
  });
}
