import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from './button.component';
import { IconComponent, type IconName } from './icon.component';

/**
 * Empty state — shown when a request succeeded but returned nothing.
 * Always offers the obvious next action so the user is never at a dead end.
 *
 *   <app-empty-state
 *     icon="scissors"
 *     title="No services yet"
 *     message="Add the services your business offers."
 *     actionLabel="Add service"
 *     (actionClicked)="openForm()" />
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ButtonComponent, RouterLink],
  template: `
    <div class="flex flex-col items-center px-6 py-14 text-center">
      <span
        class="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400"
        aria-hidden="true"
      >
        <app-icon [name]="icon()" class="size-6" />
      </span>

      <h3 class="mt-4 text-sm font-semibold text-slate-900">{{ title() }}</h3>

      @if (message(); as text) {
        <p class="mt-1 max-w-sm text-sm text-slate-500">{{ text }}</p>
      }

      @if (actionLabel(); as label) {
        <div class="mt-5">
          @if (actionLink(); as link) {
            <!-- Internal navigation: a real anchor, so it is keyboard- and
                 screen-reader-friendly without any extra wiring. -->
            <a [routerLink]="link" [queryParams]="actionQueryParams()">
              <app-button [icon]="actionIcon()">{{ label }}</app-button>
            </a>
          } @else {
            <app-button [icon]="actionIcon()" (clicked)="actionClicked.emit()">
              {{ label }}
            </app-button>
          }
        </div>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('info');
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly actionLabel = input<string>('');
  readonly actionIcon = input<IconName>('plus');
  /** When set, the action becomes a router link instead of a click handler. */
  readonly actionLink = input<string | string[] | null>(null);
  readonly actionQueryParams = input<Record<string, unknown> | null>(null);
  readonly actionClicked = output<void>();
}
