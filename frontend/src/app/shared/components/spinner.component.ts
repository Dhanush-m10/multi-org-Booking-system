import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Loading spinner. Used inside buttons and as the centrepiece of a page's
 * loading state.
 */
@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="animate-spin"
      [attr.viewBox]="'0 0 24 24'"
      fill="none"
      role="status"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
      <path
        class="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
      <title>Loading</title>
    </svg>
  `,
  host: {
    class: 'inline-block size-5 text-current',
  },
})
export class SpinnerComponent {
  readonly size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
}
