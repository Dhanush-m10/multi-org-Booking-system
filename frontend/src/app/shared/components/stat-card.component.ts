import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent, type IconName } from './icon.component';

/**
 * A single dashboard metric. The value always comes from real API data — see
 * `DashboardService`. `hint` is optional supporting text, also derived.
 */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      class="rounded-card border border-slate-200 bg-white p-5 shadow-card transition hover:border-slate-300"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-medium text-slate-500">{{ label() }}</p>
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"
          aria-hidden="true"
        >
          <app-icon [name]="icon()" class="size-4.5" />
        </span>
      </div>

      <p class="mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {{ value() }}
      </p>

      @if (hint(); as text) {
        <p class="mt-1 text-xs text-slate-500">{{ text }}</p>
      }
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>('');
  readonly icon = input<IconName>('tag');
}
