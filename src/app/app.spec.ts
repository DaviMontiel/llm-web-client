import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { setupStorage } from '../testing/test-helpers';
import { App } from './app';
import { SettingsService } from './core/settings/settings.service';
import { LayoutService } from './core/ui/layout.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
    setupStorage();
  });

  it('renderiza el shell con sidebar', async () => {
    TestBed.inject(SettingsService).update({ onboarded: true });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-sidebar')).toBeTruthy();
    expect(el.textContent).toContain('Nuevo chat');
  });

  it('muestra el onboarding en el primer arranque', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(TestBed.inject(LayoutService).onboardingOpen()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Configura un modelo para empezar');
  });

  it('abre la búsqueda con Ctrl+K y los atajos con Ctrl+/', async () => {
    TestBed.inject(SettingsService).update({ onboarded: true });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const layout = TestBed.inject(LayoutService);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    expect(layout.searchOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true }));
    expect(layout.shortcutsOpen()).toBe(true);
  });
});
