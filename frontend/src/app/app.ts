import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConfirmHostComponent } from './shared/components/confirm-host.component';
import { ToastHostComponent } from './shared/components/toast-host.component';

/**
 * Root component: the outlet plus the global overlay hosts.
 *
 * Toasts and confirmation dialogs live here, not in `AppShellComponent`,
 * because the customer portal (`/book/...`, `/customer/bookings`) and the auth
 * screens sit outside the shell and still need them. Both hosts render nothing
 * until `ToastService` or `ConfirmService` raises a request.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  templateUrl: './app.html',
})
export class App {}
