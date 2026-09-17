import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * White surface with a subtle border. The base building block for every panel.
 *
 *   <app-card>
 *     <div card-header>Title</div>
 *     body...
 *     <div card-footer>...</div>
 *   </app-card>
 */
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-card border border-slate-200 bg-white shadow-card"
      [class.overflow-hidden]="flush()"
    >
      <ng-content select="[card-header]" />
      <div [class.p-5]="!flush()">
        <ng-content />
      </div>
      <ng-content select="[card-footer]" />
    </section>
  `,
})
export class CardComponent {
  /** Removes the default body padding (for tables that bleed to the edges). */
  readonly flush = input(true);
}
