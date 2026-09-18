import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { safeReturnUrl } from '../../../core/guards/auth.guard';
import { toApiError } from '../../../core/utils/api-errors';
import { AuthLayoutComponent } from '../auth-layout.component';
import { ButtonComponent } from '../../../shared/components/button.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { IconComponent } from '../../../shared/components/icon.component';

/**
 * Sign-in screen.
 *
 * Talks to the existing `POST /api/auth/login/` (SimpleJWT `TokenObtainPairView`),
 * which expects `{ username, password }` and returns `{ access, refresh }`.
 * No fake authentication: if the request fails the backend's own message is
 * shown.
 *
 * Admins, staff and customers all sign in here — they are ordinary Django users
 * whose `OrganizationMembership.role` differs. Immediately after the tokens are
 * stored, `GET /api/auth/me/` resolves the real role so the guards can send a
 * customer to `/customer/bookings` and an admin to the dashboard. That call is
 * best-effort: if it fails the user is still signed in and the guards fall back
 * to their existing behaviour.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AuthLayoutComponent,
    ButtonComponent,
    FieldComponent,
    IconComponent,
  ],
  templateUrl: './login.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Where to go after a successful sign-in (set by `authGuard`). */
  private readonly returnUrl = safeReturnUrl(
    this.router.parseUrl(this.router.url).queryParams['returnUrl'] ?? null,
  );

  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(150)]],
    password: ['', [Validators.required]],
  });

  protected fieldError(name: 'username' | 'password'): string {
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return name === 'username' ? 'Username is required.' : 'Password is required.';
    }
    return 'Please check this field.';
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.submitting.set(true);

    this.authService
      .login(this.form.getRawValue())
      // Resolve who this actually is. Failure here must not fail the login:
      // the session is valid either way, and the guards degrade gracefully.
      .pipe(switchMap(() => this.authService.loadCurrentUser().pipe(catchError(() => of(null)))))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.success('Signed in successfully.', 'Welcome back');
          void this.router.navigateByUrl(this.returnUrl);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          // The backend answers 401 with `{ "detail": "No active account found
          // with the given credentials" }`. `toApiError` turns that (and any
          // network failure) into one readable sentence.
          this.errorMessage.set(toApiError(error).message);
        },
      });
  }
}
