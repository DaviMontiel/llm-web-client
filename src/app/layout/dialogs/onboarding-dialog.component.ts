import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TPipe } from '../../core/i18n/t.pipe';
import { SettingsService } from '../../core/settings/settings.service';
import { LayoutService } from '../../core/ui/layout.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';

/** Primer arranque: invita a configurar un modelo sin obligar a hacerlo. */
@Component({
  selector: 'app-onboarding-dialog',
  imports: [ModalComponent, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="layout.onboardingOpen()" size="sm" [ariaLabel]="'onboarding.title' | t" (closed)="explore()">
      <div class="welcome">
        <div class="mark"><app-icon name="sparkles" [size]="22" /></div>
        <h2>{{ 'onboarding.title' | t }}</h2>
        <p>{{ 'onboarding.body' | t }}</p>
        <ul class="points">
          <li><app-icon name="key-round" [size]="14" /> {{ 'onboarding.point1' | t }}</li>
          <li><app-icon name="folder-open" [size]="14" /> {{ 'onboarding.point2' | t }}</li>
          <li><app-icon name="hard-drive" [size]="14" /> {{ 'onboarding.point3' | t }}</li>
        </ul>
        <div class="actions">
          <button type="button" class="btn btn-primary btn-lg" (click)="configure()" cdkFocusInitial>
            {{ 'onboarding.configure' | t }}
          </button>
          <button type="button" class="btn btn-ghost btn-lg" (click)="explore()">{{ 'onboarding.explore' | t }}</button>
        </div>
      </div>
    </app-modal>
  `,
  styles: `
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 20px 4px 4px;
    }
    .mark {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 16px;
      background: var(--accent-soft);
      color: var(--accent);
      margin-bottom: 16px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    p {
      margin-top: 6px;
      color: var(--muted);
    }
    .points {
      list-style: none;
      margin: 18px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
      font-size: 13px;
      color: var(--muted);
    }
    .points li {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      margin-top: 22px;
    }
  `,
})
export class OnboardingDialogComponent {
  protected readonly layout = inject(LayoutService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);

  protected configure(): void {
    this.finish();
    void this.router.navigate(['/settings/models']);
  }

  protected explore(): void {
    this.finish();
  }

  private finish(): void {
    this.layout.onboardingOpen.set(false);
    if (!this.settings.settings().onboarded) {
      this.settings.update({ onboarded: true });
      void this.settings.flush();
    }
  }
}
