import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../../shared/components/icon.component';

/**
 * Shared frame for the public screens (login / register).
 *
 * Desktop: split screen — brand panel on the left, form on the right.
 * Mobile:  the brand panel collapses to a compact header so the form gets the
 *          whole viewport and nothing overflows.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="min-h-dvh bg-slate-100 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <!-- Brand panel -->
      <aside
        class="relative flex flex-col justify-between overflow-hidden bg-slate-900 px-6 py-8
               lg:px-12 lg:py-12"
      >
        <div
          class="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-brand-600/20 blur-3xl"
          aria-hidden="true"
        ></div>

        <div class="relative flex items-center gap-2.5">
          <span
            class="grid size-9 place-items-center rounded-lg bg-brand-600 text-white"
            aria-hidden="true"
          >
            <app-icon name="calendar" class="size-5" />
          </span>
          <span class="text-base font-semibold text-white">BookingDesk</span>
        </div>

        <div class="relative mt-8 hidden lg:block">
          <h2 class="max-w-md text-3xl leading-tight font-semibold tracking-tight text-white">
            {{ headline() }}
          </h2>
          <p class="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
            {{ blurb() }}
          </p>

          <ul class="mt-8 space-y-3">
            @for (point of highlights; track point) {
              <li class="flex items-start gap-3 text-sm text-slate-300">
                <span
                  class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-brand-300"
                  aria-hidden="true"
                >
                  <app-icon name="check" class="size-3" />
                </span>
                {{ point }}
              </li>
            }
          </ul>
        </div>

        <p class="relative mt-8 hidden text-xs text-slate-500 lg:block">
          Multi-organization booking management
        </p>
      </aside>

      <!-- Form panel -->
      <main class="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8 lg:min-h-0">
        <div class="w-full max-w-md">
          <!-- Compact brand for mobile, where the panel above is trimmed -->
          <div class="mb-8 flex items-center gap-2.5 lg:hidden">
            <span
              class="grid size-9 place-items-center rounded-lg bg-brand-600 text-white"
              aria-hidden="true"
            >
              <app-icon name="calendar" class="size-5" />
            </span>
            <span class="text-base font-semibold text-slate-900">BookingDesk</span>
          </div>

          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly headline = input('Run your bookings from one calm dashboard.');
  readonly blurb = input(
    'Services, staff, availability and appointments — scoped to your organization and nothing else.',
  );

  protected readonly highlights = [
    'Every organization sees only its own data',
    'Bookings validated against real working hours',
    'Live status for every appointment',
  ];
}
