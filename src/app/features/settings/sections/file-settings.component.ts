import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { browserSupport } from '../../../core/filesystem/fs-support';
import { TPipe } from '../../../core/i18n/t.pipe';
import { DEFAULT_IGNORE_PATTERNS } from '../../../core/models';
import { SettingsService } from '../../../core/settings/settings.service';
import { parsePatternList } from '../../../core/utils/glob';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-file-settings',
  imports: [TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.css',
  template: `
    <div class="section-head">
      <h2>{{ 'settings.nav.files' | t }}</h2>
      <p>{{ 'settings.files.desc' | t }}</p>
    </div>

    <div class="group">
      <p class="group-title">{{ 'settings.browserSupport' | t }}</p>
      @for (item of support; track item.key) {
        <div class="setting">
          <div class="setting-text">
            <p class="setting-label">{{ item.key | t }}</p>
          </div>
          <div class="control">
            @if (item.ok) {
              <span class="badge badge-success"
                ><app-icon name="check" [size]="12" /> {{ 'settings.supported' | t }}</span
              >
            } @else {
              <span class="badge badge-warning">{{ 'settings.notSupported' | t }}</span>
            }
          </div>
        </div>
      }
    </div>

    <div class="group">
      <p class="group-title">{{ 'settings.limits' | t }}</p>
      <div class="setting">
        <div class="setting-text">
          <label class="setting-label" for="maxsize">{{ 'settings.maxFileSize' | t }}</label>
          <p class="setting-desc">{{ 'settings.maxFileSizeDesc' | t }}</p>
        </div>
        <div class="control">
          <input
            id="maxsize"
            class="input input-num"
            type="number"
            min="0.1"
            step="1"
            [value]="s().maxFileSizeMB"
            (change)="settings.update({ maxFileSizeMB: +$any($event.target).value })"
          />
          MB
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <label class="setting-label" for="maxfiles">{{ 'settings.maxFiles' | t }}</label>
          <p class="setting-desc">{{ 'settings.maxFilesDesc' | t }}</p>
        </div>
        <div class="control">
          <input
            id="maxfiles"
            class="input input-num"
            type="number"
            min="1"
            max="200"
            [value]="s().maxFiles"
            (change)="settings.update({ maxFiles: +$any($event.target).value })"
          />
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <label class="setting-label" for="maxctx">{{ 'settings.maxContext' | t }}</label>
          <p class="setting-desc">{{ 'settings.maxContextDesc' | t }}</p>
        </div>
        <div class="control">
          <input
            id="maxctx"
            class="input input-num"
            type="number"
            min="8"
            step="64"
            [value]="s().maxContextKB"
            (change)="settings.update({ maxContextKB: +$any($event.target).value })"
          />
          KB
        </div>
      </div>
      <div class="setting vertical">
        <div class="setting-text">
          <label class="setting-label" for="exts">{{ 'settings.allowedExtensions' | t }}</label>
          <p class="setting-desc">{{ 'settings.allowedExtensionsDesc' | t }}</p>
        </div>
        <input
          id="exts"
          class="input mono"
          [value]="s().allowedExtensions.join(', ')"
          (change)="setExtensions($any($event.target).value)"
          placeholder="ts, html, css, md, png"
          spellcheck="false"
        />
      </div>
    </div>

    <div class="group">
      <div class="setting vertical">
        <div class="setting-text">
          <label class="setting-label" for="ignore">{{ 'settings.ignorePatterns' | t }}</label>
          <p class="setting-desc">{{ 'settings.ignorePatternsDesc' | t }}</p>
        </div>
        <textarea
          id="ignore"
          class="textarea mono"
          rows="10"
          [value]="s().ignorePatterns.join('\\n')"
          (change)="setIgnore($any($event.target).value)"
          spellcheck="false"
        ></textarea>
        <div>
          <button type="button" class="btn btn-sm btn-ghost" (click)="resetIgnore()">
            {{ 'settings.resetDefaults' | t }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FileSettingsComponent {
  protected readonly settings = inject(SettingsService);
  protected readonly s = this.settings.settings;
  protected readonly support = [
    { key: 'settings.support.fsAccess' as const, ok: browserSupport.directoryPicker() },
    { key: 'settings.support.dirUpload' as const, ok: browserSupport.directoryUpload() },
    { key: 'settings.support.clipboard' as const, ok: browserSupport.clipboardRead() },
    { key: 'settings.support.indexedDb' as const, ok: browserSupport.indexedDb() },
    { key: 'settings.support.streaming' as const, ok: browserSupport.streamingFetch() },
  ];

  protected setExtensions(value: string): void {
    this.settings.update({
      allowedExtensions: value
        .split(/[\s,;]+/)
        .map((e) => e.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean),
    });
  }

  protected setIgnore(value: string): void {
    this.settings.update({ ignorePatterns: parsePatternList(value) });
  }

  protected resetIgnore(): void {
    this.settings.update({ ignorePatterns: [...DEFAULT_IGNORE_PATTERNS] });
  }
}
