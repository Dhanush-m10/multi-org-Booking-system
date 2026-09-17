import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Confirmation dialogs for destructive or hard-to-undo actions
 * (cancel a booking, deactivate a staff member, ...).
 *
 * Usage:
 *   const ok = await firstValueFrom(
 *     this.confirm.ask({
 *       title: 'Cancel booking?',
 *       message: 'The appointment will be released.',
 *       confirmLabel: 'Cancel booking',
 *       tone: 'danger',
 *     }),
 *   );
 *   if (!ok) return;
 *
 * The dialog itself is rendered once by `<app-confirm-host>` in the app shell,
 * so screens never duplicate modal markup and never run a destructive action
 * by accident.
 */

export type ConfirmTone = 'danger' | 'primary';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export interface ConfirmRequest extends Required<ConfirmOptions> {
  resolve: (accepted: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _request = signal<ConfirmRequest | null>(null);

  /** The dialog host reads this; null means "closed". */
  readonly request = this._request.asReadonly();

  ask(options: ConfirmOptions): Observable<boolean> {
    return new Observable<boolean>((subscriber) => {
      let settled = false;

      const resolve = (accepted: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        this._request.set(null);
        subscriber.next(accepted);
        subscriber.complete();
      };

      this._request.set({
        title: options.title,
        message: options.message ?? '',
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Keep as is',
        tone: options.tone ?? 'danger',
        resolve,
      });

      // Closing the dialog by any other means (navigation, Esc handled by the
      // host) counts as "no".
      return () => resolve(false);
    });
  }
}
