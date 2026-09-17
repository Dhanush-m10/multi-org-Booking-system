import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';

import { IconComponent } from './icon.component';

/**
 * Search box used by every list screen. Emits on each keystroke; the screens
 * filter client-side because the backend list endpoints expose no search
 * parameter.
 */
@Component({
  selector: 'app-search-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="relative">
      <span
        class="pointer-events-none absolute inset-y-0 left-0 grid w-9 place-items-center text-slate-400"
        aria-hidden="true"
      >
        <app-icon name="search" class="size-4" />
      </span>

      <input
        [id]="id()"
        type="search"
        role="searchbox"
        class="form-control h-10 pl-9"
        [class.w-full]="true"
        [placeholder]="placeholder()"
        [value]="value()"
        [attr.aria-label]="ariaLabel() || placeholder()"
        (input)="onInput($event)"
      />

      @if (value()) {
        <button
          type="button"
          class="absolute inset-y-0 right-0 grid w-9 place-items-center text-slate-400 hover:text-slate-600"
          [attr.aria-label]="'Clear search'"
          (click)="cleared.emit()"
        >
          <app-icon name="close" class="size-4" />
        </button>
      }
    </div>
  `,
})
export class SearchInputComponent {
  readonly value = input('');
  readonly placeholder = input('Search…');
  readonly ariaLabel = input('');
  readonly id = input('search');

  readonly changed = output<string>();
  readonly cleared = output<void>();

  protected onInput(event: Event): void {
    this.changed.emit((event.target as HTMLInputElement).value);
  }
}

/**
 * A labelled `<select>`, styled to match `form-control`.
 * Wrapping selects avoids repeating the chevron/`appearance-none` utilities.
 */
@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="relative">
      <select
        [id]="id()"
        class="form-control h-10 appearance-none pr-9"
        [value]="value()"
        [attr.aria-label]="ariaLabel() || label()"
        [disabled]="disabled()"
        (change)="onChange($event)"
      >
        <ng-content />
      </select>
      <span
        class="pointer-events-none absolute inset-y-0 right-0 grid w-9 place-items-center text-slate-400"
        aria-hidden="true"
      >
        <app-icon name="chevronDown" class="size-4" />
      </span>
    </div>
  `,
})
export class SelectComponent {
  readonly value = input<string>('');
  readonly id = input('select');
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly changed = output<string>();

  protected onChange(event: Event): void {
    this.changed.emit((event.target as HTMLSelectElement).value);
  }
}

/** Small "N results" / "Showing X of Y" caption under a toolbar. */
@Component({
  selector: 'app-result-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <p class="text-xs text-slate-500" aria-live="polite">{{ text() }}</p> `,
})
export class ResultCountComponent {
  readonly shown = input(0);
  readonly total = input(0);
  readonly noun = input('records');

  protected readonly text = computed(() => {
    const noun = this.noun();
    const total = this.total();
    const shown = this.shown();
    if (shown === total) {
      return `${total} ${noun}${total === 1 ? '' : 's'}`;
    }
    return `Showing ${shown} of ${total} ${noun}`;
  });
}
