import { Injectable, signal } from '@angular/core';

/**
 * Application-wide toast notifications.
 *
 * One service, one host component (`<app-toast-host>` mounted in the app
 * shell), so every screen reports success/failure the same way. Components call
 * `toast.success(...)` and never build their own notification markup.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

/** How long each toast stays on screen, by severity. */
const DURATION: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 7000,
};

/** Never let a wall of stacked toasts cover the UI. */
const MAX_VISIBLE = 4;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  private nextId = 1;

  readonly toasts = this._toasts.asReadonly();

  success(message: string, title = 'Success'): void {
    this.push({ type: 'success', title, message });
  }

  error(message: string, title = 'Something went wrong'): void {
    this.push({ type: 'error', title, message });
  }

  info(message: string, title = 'Heads up'): void {
    this.push({ type: 'info', title, message });
  }

  warning(message: string, title = 'Warning'): void {
    this.push({ type: 'warning', title, message });
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(toast: Omit<Toast, 'id'>): void {
    const id = this.nextId++;
    this._toasts.update((list) => [...list.slice(-(MAX_VISIBLE - 1)), { ...toast, id }]);

    // Auto-dismiss. The timer is not tracked because dismissing an
    // already-removed toast is a no-op.
    setTimeout(() => this.dismiss(id), DURATION[toast.type]);
  }
}
