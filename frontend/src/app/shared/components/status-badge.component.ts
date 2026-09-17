import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { BookingStatus } from '../../core/models/api.models';
import { statusStyle } from '../booking-status';

/**
 * Booking status pill. Label + colour both come from `booking-status.ts`, and
 * the text is always present so the status is never communicated by colour
 * alone.
 */
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      [class]="
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ' +
        style().badge
      "
    >
      <span class="size-1.5 rounded-full" [class]="style().dot" aria-hidden="true"></span>
      {{ style().label }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<BookingStatus | string>();
  protected readonly style = computed(() => statusStyle(this.status()));
}
