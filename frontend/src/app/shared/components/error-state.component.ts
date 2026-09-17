import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from './button.component';
import { IconComponent } from './icon.component';

/**
 * Error state — shown when a request failed. Always offers Retry, and never
 * prints a raw stack trace: the message comes from `toApiError`, which maps
 * Django responses to plain English.
 */
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ButtonComponent],
  template: `
    <div class="flex flex-col items-center px-6 py-14 text-center" role="alert">
      <span
        class="grid size-12 place-items-center rounded-full bg-danger-50 text-danger-600"
        aria-hidden="true"
      >
        <app-icon name="alert" class="size-6" />
      </span>

      <h3 class="mt-4 text-sm font-semibold text-slate-900">{{ title() }}</h3>

      @if (message(); as text) {
        <p class="mt-1 max-w-md text-sm text-slate-500">{{ text }}</p>
      }

      <div class="mt-5">
        <app-button variant="secondary" icon="refresh" (clicked)="retried.emit()">
          {{ retryLabel() }}
        </app-button>
      </div>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly title = input('Unable to load data');
  readonly message = input<string>('');
  readonly retryLabel = input('Try again');
  readonly retried = output<void>();
}
