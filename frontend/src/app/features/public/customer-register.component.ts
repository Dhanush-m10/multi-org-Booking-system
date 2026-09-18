import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { PublicOrganizationService } from '../../core/services/public-organization.service';
import { ToastService } from '../../core/services/toast.service';
import { safeReturnUrl } from '../../core/guards/auth.guard';
import type { PublicOrganization } from '../../core/models/api.models';
import { apiErrorMessage, toApiError } from '../../core/utils/api-errors';
import { AuthLayoutComponent } from '../auth/auth-layout.component';
import { ButtonComponent } from '../../shared/components/button.component';
import { FieldComponent } from '../../shared/components/field.component';
import { IconComponent } from '../../shared/components/icon.component';

/**
 * Customer sign-up for one specific organization.
 *
 *   POST /api/auth/customer/register/
 *
 * Reached from `/book/<slug>/register`, so the organization is taken from the
 * slug already in the URL and sent as `organization_slug`. The visitor is never
 * shown an organization picker and never submits a database id: the slug they
 * arrived with is the only selector, and the backend resolves it.
 *
 * There is no role field on the form or in the payload. The backend always
 * creates a CUSTOMER membership, so this screen cannot mint an admin.
 *
 * Registration returns no tokens (same as the organization register endpoint),
 * so the password is used once more against the ordinary `/api/auth/login/` to
 * sign the new customer straight in. If that second call fails for any reason
 * the account still exists and the visitor is sent to the sign-in screen with
 * their destination preserved — nothing is silently lost.
 */
@Component({
  selector: 'app-customer-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AuthLayoutComponent,
    ButtonComponent,
    FieldComponent,
    IconComponent,
  ],
  templateUrl: './customer-register.component.html',
})
export class CustomerRegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly publicApi = inject(PublicOrganizationService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** From `/book/:organizationSlug/register`. */
  readonly organizationSlug = input<string>('');

  protected readonly organization = signal<PublicOrganization | null>(null);
  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = signal('');

  /** Where to return after signing in, carried through from the booking flow. */
  protected readonly returnUrl = safeReturnUrl(
    this.router.parseUrl(this.router.url).queryParams['returnUrl'] ?? null,
  );

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', [Validators.maxLength(20)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  });

  constructor() {
    // Show which business the account is for, so the visitor can tell they are
    // on the right page. A 404 here is not fatal — the register call will report
    // it — but it is better to say so before they fill in a form.
    const slug = this.organizationSlug();
    if (slug) {
      this.publicApi.getOrganization(slug).subscribe({
        next: (org) => this.organization.set(org),
        error: () => this.errorMessage.set('We could not find that organization.'),
      });
    }
  }

  protected fieldError(name: 'name' | 'email' | 'phone' | 'password' | 'confirmPassword'): string {
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return name === 'confirmPassword'
        ? 'Please confirm your password.'
        : 'This field is required.';
    }
    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }
    if (control.hasError('minlength')) {
      return 'Use at least 8 characters.';
    }
    if (control.hasError('maxlength')) {
      return 'That is too long.';
    }
    return 'Please check this field.';
  }

  /** Cross-field check the validators above cannot express. */
  protected passwordMismatch(): boolean {
    const { password, confirmPassword } = this.form.controls;
    return confirmPassword.touched && password.value !== confirmPassword.value;
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.passwordMismatch() || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, email, phone, password } = this.form.getRawValue();
    this.errorMessage.set('');
    this.submitting.set(true);

    this.authService
      .customerRegister({
        organization_slug: this.organizationSlug(),
        name,
        email,
        phone,
        password,
      })
      .pipe(switchMap(() => this.authService.login({ username: email, password })))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.success('Your account is ready.', 'Welcome');
          void this.router.navigateByUrl(this.returnUrl);
        },
        error: (error: unknown) => {
          this.submitting.set(false);

          // Distinguish "the account could not be created" from "it was created
          // but signing in did not work". In the second case the account exists,
          // so the visitor is sent to sign in rather than told to start again.
          const apiError = toApiError(error);
          if (apiError.fieldErrors && Object.keys(apiError.fieldErrors).length > 0) {
            this.errorMessage.set(apiErrorMessage(error));
            return;
          }

          this.toast.info('Your account was created. Please sign in to continue.', 'Almost there');
          void this.router.navigate(['/login'], {
            queryParams: { returnUrl: this.returnUrl },
          });
        },
      });
  }

  protected togglePassword(): void {
    this.showPassword.update((value) => !value);
  }
}
