import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Standard page heading: title, optional description, optional actions on the
 * right. Keeps every screen's top area aligned.
 *
 *   <app-page-header title="Services" subtitle="...">
 *     <app-button icon="plus">Add service</app-button>
 *   </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {{ title() }}
        </h1>
        @if (subtitle(); as text) {
          <p class="mt-1 text-sm text-slate-500">{{ text }}</p>
        }
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
