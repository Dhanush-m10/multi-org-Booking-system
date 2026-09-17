import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../shared/components/button.component';

/** Fallback route for unknown URLs. */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent],
  template: `
    <div class="grid min-h-dvh place-items-center bg-slate-100 px-4">
      <div class="w-full max-w-md text-center">
        <p class="text-sm font-semibold text-brand-700">404</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Page not found</h1>
        <p class="mt-2 text-sm text-slate-500">
          The page you were looking for does not exist or has been moved.
        </p>
        <div class="mt-6 flex justify-center">
          <a routerLink="/dashboard">
            <app-button icon="arrowRight">Back to dashboard</app-button>
          </a>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundComponent {}
