import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

import { IconComponent } from './icon.component';

/**
 * Accessible dialog used for every form and detail view.
 *
 *  - Rendered only while `open` is true, so closed dialogs cost nothing.
 *  - Escape closes; clicking the backdrop closes.
 *  - Focus moves into the panel on open, Tab is trapped inside it, and focus
 *    returns to the element that opened the dialog on close.
 *  - Body scroll is locked while open.
 *  - `size` controls the max width; content scrolls internally so tall forms
 *    never push the action buttons off-screen on mobile.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <!-- Backdrop -->
        <button
          type="button"
          class="absolute inset-0 cursor-default bg-slate-900/50 backdrop-blur-[1px]"
          tabindex="-1"
          aria-hidden="true"
          (click)="requestClose()"
        ></button>

        <!-- Panel -->
        <div
          #panel
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="labelId()"
          tabindex="-1"
          class="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-pop
                 sm:max-h-[88vh] sm:rounded-xl"
          [class]="sizeClass()"
          (keydown.escape)="requestClose()"
          (keydown.tab)="onTab($event)"
          (keydown.shift.tab)="onTab($event)"
        >
          <header
            class="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"
          >
            <div class="min-w-0">
              <h2 [id]="labelId()" class="text-base font-semibold text-slate-900">
                {{ title() }}
              </h2>
              @if (description(); as text) {
                <p class="mt-0.5 text-sm text-slate-500">{{ text }}</p>
              }
            </div>
            <button
              type="button"
              class="-m-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-slate-400
                     transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close dialog"
              (click)="requestClose()"
            >
              <app-icon name="close" class="size-4" />
            </button>
          </header>

          <div class="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <ng-content />
          </div>

          @if (showFooter()) {
            <footer class="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
              <ng-content select="[modal-footer]" />
            </footer>
          }
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  readonly open = input(false, { transform: booleanAttribute });
  readonly title = input.required<string>();
  readonly description = input<string>('');
  readonly size = input<keyof typeof SIZES>('md');
  readonly labelId = input('modal-title');
  /** When false, backdrop/Escape are ignored (e.g. while a request is running). */
  readonly dismissible = input(true, { transform: booleanAttribute });
  /** Set false when the projected content renders its own action row. */
  readonly showFooter = input(true, { transform: booleanAttribute });

  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly sizeClass = computed(() => SIZES[this.size()]);

  /** The element that had focus before the dialog opened. */
  private previousFocus: HTMLElement | null = null;

  constructor(destroyRef: DestroyRef) {
    // On open: remember where focus was, lock scrolling, and move focus into
    // the panel. On close: unlock scrolling and hand focus back to the trigger,
    // so a keyboard user does not end up at the top of the document.
    effect(() => {
      if (this.open()) {
        this.previousFocus = (document.activeElement as HTMLElement | null) ?? null;
        document.body.style.overflow = 'hidden';
        queueMicrotask(() => this.panel()?.nativeElement.focus());
      } else {
        this.release();
      }
    });

    // A host may destroy this component outright (`@if (open()) { <app-modal …> }`)
    // instead of flipping `open` to false. Without this the scroll lock would
    // stay on and the page would become permanently unscrollable.
    destroyRef.onDestroy(() => this.release());
  }

  /** Undo everything `open` did. Safe to call more than once. */
  private release(): void {
    document.body.style.overflow = '';
    const trigger = this.previousFocus;
    this.previousFocus = null;
    // The trigger may have been removed while the dialog was open (e.g. the row
    // it belonged to was re-rendered), so guard before focusing.
    if (trigger?.isConnected) {
      trigger.focus();
    }
  }

  /**
   * Keep Tab cycling inside the dialog. Without this, focus escapes to the page
   * behind the overlay, which is invisible but still interactive.
   *
   * Both `(keydown.tab)` and `(keydown.shift.tab)` are bound: Angular matches a
   * pseudo-event against the *full* key name, and Shift+Tab produces
   * `"shift.tab"`, which `(keydown.tab)` alone never sees.
   */
  protected onTab(event: Event): void {
    // Angular types a `.tab`-modified keydown as a plain `Event`, so narrow here
    // rather than casting in the template.
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }

    // Angular's `@if` removes non-rendered content from the DOM entirely, so the
    // only things left to exclude are semantically hidden elements. Deliberately
    // not using `offsetParent`/`getClientRects`, which depend on layout and are
    // unavailable outside a real browser.
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => !element.hasAttribute('hidden') && element.getAttribute('type') !== 'hidden',
    );
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === panel)) {
      // `active === panel` happens when the panel itself is focused (tabindex -1)
      // and there is a single focusable control inside.
      if (active !== first) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  requestClose(): void {
    if (this.dismissible()) {
      this.closed.emit();
    }
  }
}
