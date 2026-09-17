import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { IconComponent } from '../shared/components/icon.component';

/**
 * Sticky top bar. Holds the mobile menu toggle, the current section name and a
 * compact account control.
 *
 * The section title is derived from the matched route's `title` data, so adding
 * a page only means adding one property to `app.routes.ts`.
 */
@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <header
      class="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur
             sm:px-6 lg:px-8"
    >
      <button
        type="button"
        class="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition
               hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        aria-label="Open navigation menu"
        aria-controls="main-navigation"
        (click)="menuToggled.emit()"
      >
        <app-icon name="menu" class="size-5" />
      </button>

      <div class="min-w-0 flex-1">
        <h1 class="truncate text-sm font-semibold text-slate-900 sm:text-base">
          {{ title() }}
        </h1>
        @if (subtitle(); as text) {
          <p class="hidden truncate text-xs text-slate-500 sm:block">{{ text }}</p>
        }
      </div>

      <span class="hidden text-xs text-slate-500 tabular-nums md:block">
        {{ today() }}
      </span>

      <span
        class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
        [attr.title]="username()"
        aria-hidden="true"
      >
        {{ userInitials() }}
      </span>
    </header>
  `,
})
export class TopbarComponent {
  readonly title = input('Dashboard');
  readonly subtitle = input('');
  readonly username = input('');
  readonly userInitials = input('?');
  readonly today = input('');

  readonly menuToggled = output<void>();
}
