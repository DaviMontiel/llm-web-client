import { Injectable, signal } from '@angular/core';
import { IconName } from '../../shared/components/icon/icons';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  separatorBefore?: boolean;
  checked?: boolean;
  run?: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
  /** Elemento que abrió el menú: recupera el foco al cerrar. */
  returnFocus: HTMLElement | null;
  ariaLabel: string;
  /** `end`: el borde derecho del menú se alinea con x. */
  align: 'start' | 'end';
  /** Borde superior del ancla, para abrir hacia arriba si no cabe debajo. */
  anchorTop: number | null;
}

/**
 * Menús contextuales y desplegables. Un único host en el shell los
 * renderiza con posición fija y navegación por teclado.
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  readonly state = signal<MenuState | null>(null);

  /** Abre bajo un elemento ancla (botón "más acciones"). */
  openAt(anchor: HTMLElement, items: MenuItem[], ariaLabel = 'Menu', align: 'start' | 'end' = 'end'): void {
    const rect = anchor.getBoundingClientRect();
    this.state.set({
      x: align === 'end' ? rect.right : rect.left,
      y: rect.bottom + 4,
      items,
      returnFocus: anchor,
      ariaLabel,
      align,
      anchorTop: rect.top,
    });
  }

  /** Abre, o cierra si ya está abierto desde el mismo ancla. */
  toggleAt(anchor: HTMLElement, items: MenuItem[], ariaLabel = 'Menu', align: 'start' | 'end' = 'end'): void {
    if (this.state()?.returnFocus === anchor) this.close();
    else this.openAt(anchor, items, ariaLabel, align);
  }

  /** Abre en la posición del puntero (clic derecho). */
  openAtPointer(event: MouseEvent, items: MenuItem[], ariaLabel = 'Menu'): void {
    event.preventDefault();
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.state.set({
      x: event.clientX,
      y: event.clientY,
      items,
      returnFocus: target,
      ariaLabel,
      align: 'start',
      anchorTop: null,
    });
  }

  close(restoreFocus = true): void {
    const s = this.state();
    this.state.set(null);
    if (restoreFocus) s?.returnFocus?.focus?.();
  }
}
