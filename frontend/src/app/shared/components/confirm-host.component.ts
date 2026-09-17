import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ConfirmService } from '../../core/services/confirm.service';
import { ButtonComponent } from './button.component';
import { IconComponent } from './icon.component';

/**
 * Hosts the shared confirmation dialog. Mounted once in the app shell; screens
 * call `ConfirmService.ask(...)` and await a boolean, so no screen implements
 * its own "are you sure?" markup.
 */
@Component({
  selector: 'app-confirm-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ButtonComponent],
  template: `
    @if (request(); as req) {
      <div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <button
          type="button"
          class="absolute inset-0 cursor-default bg-slate-900/50"
          tabindex="-1"
          aria-hidden="true"
          (click)="req.resolve(false)"
        ></button>

        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          class="relative w-full max-w-md rounded-xl bg-white p-6 shadow-pop"
          (keydown.escape)="req.resolve(false)"
        >
          <div class="flex items-start gap-4">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-full"
              [class]="
                req.tone === 'danger'
                  ? 'bg-danger-50 text-danger-600'
                  : 'bg-brand-50 text-brand-700'
              "
              aria-hidden="true"
            >
              <app-icon [name]="iconName()" class="size-5" />
            </span>

            <div class="min-w-0">
              <h2 id="confirm-title" class="text-base font-semibold text-slate-900">
                {{ req.title }}
              </h2>
              @if (req.message) {
                <p id="confirm-message" class="mt-1 text-sm text-slate-500">
                  {{ req.message }}
                </p>
              }
            </div>
          </div>

          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <app-button variant="secondary" (clicked)="req.resolve(false)">
              {{ req.cancelLabel }}
            </app-button>
            <app-button
              [variant]="req.tone === 'danger' ? 'danger' : 'primary'"
              (clicked)="req.resolve(true)"
            >
              {{ req.confirmLabel }}
            </app-button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmHostComponent {
  private readonly confirmService = inject(ConfirmService);

  protected readonly request = this.confirmService.request;
  protected readonly iconName = computed(() =>
    this.request()?.tone === 'danger' ? 'alert' : 'info',
  );
}
