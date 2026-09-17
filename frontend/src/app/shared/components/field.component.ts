import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

import { IconComponent } from './icon.component';

/**
 * Form field wrapper: consistent label, optional required marker, optional hint
 * and an error slot that is wired to the control with `aria-describedby`.
 *
 * Using this everywhere means no form in the app hand-rolls its own label/error
 * markup, and error text is always associated with its input for screen readers.
 *
 *   <app-field label="Email" for="email" [error]="errors()['email']" [required]="true">
 *     <input id="email" type="email" class="form-control" formControlName="email" />
 *   </app-field>
 */
@Component({
  selector: 'app-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="space-y-1.5">
      <label [for]="for()" class="flex items-center gap-1 text-sm font-medium text-slate-700">
        {{ label() }}
        @if (required()) {
          <span class="text-danger-600" aria-hidden="true">*</span>
          <span class="sr-only">(required)</span>
        }
      </label>

      <ng-content />

      @if (error(); as message) {
        <p
          [id]="describedBy()"
          class="flex items-start gap-1.5 text-sm text-danger-700"
          role="alert"
        >
          <app-icon name="alert" class="mt-0.5 size-3.5 shrink-0" />
          <span>{{ message }}</span>
        </p>
      } @else if (hint(); as text) {
        <p [id]="describedBy()" class="text-xs text-slate-500">{{ text }}</p>
      }
    </div>
  `,
})
export class FieldComponent {
  readonly label = input.required<string>();
  /** Must match the id of the projected control. */
  readonly for = input.required<string>();
  readonly hint = input<string>('');
  readonly error = input<string>('');
  readonly required = input(false, { transform: booleanAttribute });

  /** Exposed so the projected control can bind `[attr.aria-describedby]`. */
  readonly describedBy = () => `${this.for()}-description`;
}
