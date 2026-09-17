import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';

import { IconComponent, type IconName } from './icon.component';
import { SpinnerComponent } from './spinner.component';

/**
 * The one button. Every actionable control in the app uses this so sizing,
 * colour, focus ring and disabled/loading behaviour are identical everywhere.
 *
 *   <app-button (clicked)="save()" [loading]="saving()">Save</app-button>
 *   <app-button variant="ghost" size="sm">Cancel</app-button>
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-55';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800',
  secondary:
    'border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 active:bg-slate-100',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-danger-600 text-white shadow-xs hover:bg-danger-700 active:bg-danger-800',
  success: 'bg-confirmed-600 text-white shadow-xs hover:bg-confirmed-700 active:bg-confirmed-800',
};

const SIZES = {
  xs: 'h-8 px-2.5 text-xs',
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
} as const;

@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SpinnerComponent],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="classes()"
      [attr.aria-busy]="loading() ? 'true' : null"
      (click)="clicked.emit($event)"
    >
      @if (loading()) {
        <app-spinner size="xs" class="size-4" />
      } @else if (icon(); as iconName) {
        <app-icon [name]="iconName" class="size-4 shrink-0" />
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<keyof typeof SIZES>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly block = input(false, { transform: booleanAttribute });
  readonly icon = input<IconName | null>(null);

  readonly clicked = output<MouseEvent>();

  protected readonly classes = computed(
    () =>
      `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()]} ${this.block() ? 'w-full' : ''}`,
  );
}
