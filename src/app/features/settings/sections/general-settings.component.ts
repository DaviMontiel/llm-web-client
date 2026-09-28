import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../../../core/i18n/t.pipe';
import { Language, MotionPreference } from '../../../core/models';
import { SettingsService } from '../../../core/settings/settings.service';
import { findTheme } from '../../../core/theme/themes';
import { SwitchComponent } from '../../../shared/components/switch/switch.component';

@Component({
  selector: 'app-general-settings',
  imports: [TPipe, SwitchComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.css',
  template: `
    <div class="section-head">
      <h2>{{ 'settings.nav.general' | t }}</h2>
      <p>{{ 'settings.general.desc' | t }}</p>
    </div>

    <div class="group">
      <div class="setting">
        <div class="setting-text">
          <label class="setting-label" for="lang">{{ 'settings.language' | t }}</label>
        </div>
        <div class="control">
          <select id="lang" class="select" [value]="s().language" (change)="setLanguage($any($event.target).value)">
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.theme' | t }}</p>
          <p class="setting-desc">{{ themeName() | t }}</p>
        </div>
        <div class="control">
          <a class="btn btn-sm" routerLink="/settings/themes">{{ 'settings.chooseTheme' | t }}</a>
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label" id="motion-label">{{ 'settings.motion' | t }}</p>
          <p class="setting-desc">{{ 'settings.motionDesc' | t }}</p>
        </div>
        <div class="control">
          <div class="segmented" role="group" aria-labelledby="motion-label">
            @for (opt of motionOptions; track opt.value) {
              <button type="button" [attr.aria-pressed]="s().motion === opt.value" (click)="setMotion(opt.value)">
                {{ opt.label | t }}
              </button>
            }
          </div>
        </div>
      </div>
    </div>

    <div class="group">
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label" id="enter-label">{{ 'settings.enterToSend' | t }}</p>
          <p class="setting-desc" id="enter-desc">
            {{ s().enterToSend ? ('settings.enterToSendOn' | t) : ('settings.enterToSendOff' | t) }}
          </p>
        </div>
        <div class="control">
          <app-switch
            [checked]="s().enterToSend"
            (checkedChange)="settings.update({ enterToSend: $event })"
            [label]="'settings.enterToSend' | t"
            describedBy="enter-desc"
          />
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.autoScroll' | t }}</p>
          <p class="setting-desc" id="scroll-desc">{{ 'settings.autoScrollDesc' | t }}</p>
        </div>
        <div class="control">
          <app-switch
            [checked]="s().autoScroll"
            (checkedChange)="settings.update({ autoScroll: $event })"
            [label]="'settings.autoScroll' | t"
            describedBy="scroll-desc"
          />
        </div>
      </div>
      <div class="setting">
        <div class="setting-text">
          <p class="setting-label">{{ 'settings.streaming' | t }}</p>
          <p class="setting-desc" id="stream-desc">{{ 'settings.streamingDesc' | t }}</p>
        </div>
        <div class="control">
          <app-switch
            [checked]="s().streaming"
            (checkedChange)="settings.update({ streaming: $event })"
            [label]="'settings.streaming' | t"
            describedBy="stream-desc"
          />
        </div>
      </div>
    </div>

    <div class="group">
      <div class="setting vertical">
        <div class="setting-text">
          <label class="setting-label" for="sys">{{ 'settings.systemPrompt' | t }}</label>
          <p class="setting-desc">{{ 'settings.systemPromptDesc' | t }}</p>
        </div>
        <textarea
          id="sys"
          class="textarea"
          rows="5"
          [value]="s().systemPrompt"
          (change)="settings.update({ systemPrompt: $any($event.target).value })"
          [placeholder]="'settings.systemPromptPlaceholder' | t"
        ></textarea>
      </div>
      <div class="setting">
        <div class="setting-text">
          <label class="setting-label" for="maxout">{{ 'settings.maxOutput' | t }}</label>
          <p class="setting-desc">{{ 'settings.maxOutputDesc' | t }}</p>
        </div>
        <div class="control">
          <input
            id="maxout"
            class="input input-num"
            type="number"
            min="256"
            step="256"
            [value]="s().maxOutputTokens"
            (change)="settings.update({ maxOutputTokens: +$any($event.target).value })"
          />
        </div>
      </div>
    </div>
  `,
})
export class GeneralSettingsComponent {
  protected readonly settings = inject(SettingsService);
  protected readonly s = this.settings.settings;
  protected readonly themeName = computed(() => findTheme(this.s().themeId).nameKey);
  protected readonly motionOptions = [
    { value: 'system' as const, label: 'settings.motion.system' as const },
    { value: 'full' as const, label: 'settings.motion.full' as const },
    { value: 'reduced' as const, label: 'settings.motion.reduced' as const },
  ];

  protected setLanguage(value: string): void {
    this.settings.update({ language: (value === 'en' ? 'en' : 'es') satisfies Language });
  }

  protected setMotion(value: MotionPreference): void {
    this.settings.update({ motion: value });
  }
}
