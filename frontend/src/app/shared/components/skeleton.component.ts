import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Skeleton placeholders shown while a list/table is loading, so the layout does
 * not jump when real data arrives.
 *
 *   <app-skeleton kind="table" [rows]="6" />
 *   <app-skeleton kind="cards" [rows]="4" />
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('table') {
        <div class="divide-y divide-slate-100" [attr.aria-busy]="'true'">
          @for (row of rowsList(); track row) {
            <div class="flex items-center gap-4 px-4 py-3.5">
              <div class="size-8 shrink-0 animate-pulse rounded-full bg-slate-200"></div>
              <div class="h-3 w-1/4 animate-pulse rounded bg-slate-200"></div>
              <div class="hidden h-3 w-1/5 animate-pulse rounded bg-slate-200 sm:block"></div>
              <div class="hidden h-3 w-1/6 animate-pulse rounded bg-slate-200 md:block"></div>
              <div class="ml-auto h-5 w-20 animate-pulse rounded-full bg-slate-200"></div>
            </div>
          }
        </div>
      }
      @case ('cards') {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" [attr.aria-busy]="'true'">
          @for (row of rowsList(); track row) {
            <div class="rounded-card border border-slate-200 bg-white p-5">
              <div class="h-3 w-20 animate-pulse rounded bg-slate-200"></div>
              <div class="mt-4 h-7 w-16 animate-pulse rounded bg-slate-200"></div>
              <div class="mt-3 h-2.5 w-24 animate-pulse rounded bg-slate-100"></div>
            </div>
          }
        </div>
      }
      @case ('lines') {
        <div class="space-y-3" [attr.aria-busy]="'true'">
          @for (row of rowsList(); track row) {
            <div class="h-3 animate-pulse rounded bg-slate-200"></div>
          }
        </div>
      }
    }
  `,
})
export class SkeletonComponent {
  readonly kind = input<'table' | 'cards' | 'lines'>('table');
  readonly rows = input(4);

  protected readonly rowsList = computed(() =>
    Array.from({ length: this.rows() }, (_, index) => index),
  );
}
