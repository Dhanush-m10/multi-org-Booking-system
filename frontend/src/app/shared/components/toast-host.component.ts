import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ToastService, type Toast, type ToastType } from '../../core/services/toast.service';
import { IconComponent, type IconName } from './icon.component';

/**
 * Renders the toast queue. Mounted once, high in the app shell, so every screen
 * reports through the same visual channel.
 *
 * The region is `aria-live="polite"` for info/success and the container is
 * reachable by keyboard (each toast has a dismiss button).
 */

const TONE: Record<ToastType, { wrap: string; icon: IconName; iconWrap: string }> = {
  success: {
    wrap: 'border-confirmed-600/25 bg-white',
    icon: 'checkCircle',
    iconWrap: 'bg-confirmed-50 text-confirmed-700',
  },
  error: {
    wrap: 'border-danger-600/25 bg-white',
    icon: 'alert',
    iconWrap: 'bg-danger-50 text-danger-700',
  },
  warning: {
    wrap: 'border-pending-600/25 bg-white',
    icon: 'alert',
    iconWrap: 'bg-pending-50 text-pending-700',
  },
  info: {
    wrap: 'border-brand-600/25 bg-white',
    icon: 'info',
    iconWrap: 'bg-brand-50 text-brand-700',
  },
};

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4
             sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      @for (toast of toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3.5 shadow-pop"
          [class]="tone(toast.type).wrap"
          role="status"
        >
          <span
            class="grid size-7 shrink-0 place-items-center rounded-full"
            [class]="tone(toast.type).iconWrap"
            aria-hidden="true"
          >
            <app-icon [name]="tone(toast.type).icon" class="size-4" />
          </span>

          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-900">{{ toast.title }}</p>
            @if (toast.message) {
              <p class="mt-0.5 text-sm break-words text-slate-600">
                {{ toast.message }}
              </p>
            }
          </div>

          <button
            type="button"
            class="-m-1 grid size-7 shrink-0 place-items-center rounded-md text-slate-400
                   transition hover:bg-slate-100 hover:text-slate-700"
            [attr.aria-label]="'Dismiss notification'"
            (click)="toastService.dismiss(toast.id)"
          >
            <app-icon name="close" class="size-3.5" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = computed(() => this.toastService.toasts());

  protected tone(type: ToastType) {
    return TONE[type];
  }
}
