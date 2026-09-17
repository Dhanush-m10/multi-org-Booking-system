import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { toApiError } from '../../../core/utils/api-errors';
import { AuthLayoutComponent } from '../auth-layout.component';
import { ButtonComponent } from '../../../shared/components/button.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { IconComponent } from '../../../shared/components/icon.component';

/**
 * Create an organization + the first user.
 *
 * Fields mirror `accounts.serializers.RegisterSerializer` exactly:
 *   username, email, password, organization_name, organization_email,
 *   organization_phone, organization_address
 *
 * Verified response: `201 { id, username, email }` — the endpoint does NOT
 * return tokens, so this screen redirects to /login instead of assuming an
 * authenticated session. The backend makes this user the organization ADMIN.
 */

/** Matches the confirm-password field against `password`. */
function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AuthLayoutComponent,
    ButtonComponent,
    FieldComponent,
    IconComponent,
  ],
  templateUrl: './register.html',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = signal('');
  /** Backend errors that belong to a specific input, e.g. `username`. */
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly form = this.fb.nonNullable.group(
    {
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150),
          Validators.pattern(/^[a-zA-Z0-9_@.+-]+$/),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],

      organization_name: ['', [Validators.required, Validators.maxLength(200)]],
      organization_email: ['', [Validators.required, Validators.email]],
      organization_phone: ['', [Validators.required, Validators.maxLength(20)]],
      organization_address: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  /** Client-side messages. Backend messages always win when present. */
  protected localError(name: string): string {
    const backend = this.fieldErrors()[name];
    if (backend) {
      return backend;
    }

    const control = this.form.controls[name as keyof typeof this.form.controls];
    if (!control || !control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return 'This field is required.';
    }
    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }
    if (control.hasError('minlength')) {
      const required = control.getError('minlength').requiredLength;
      return `Use at least ${required} characters.`;
    }
    if (control.hasError('maxlength')) {
      const max = control.getError('maxlength').requiredLength;
      return `Keep this under ${max} characters.`;
    }
    if (control.hasError('pattern')) {
      return 'Letters, numbers and @ . + - _ only.';
    }
    return 'Please check this field.';
  }

  protected confirmError(): string {
    if (this.form.hasError('mismatch') && this.form.controls.confirmPassword.touched) {
      return 'Passwords do not match.';
    }
    return this.localError('confirmPassword');
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.fieldErrors.set({});
    this.submitting.set(true);

    const { confirmPassword: _ignored, ...payload } = this.form.getRawValue();

    this.authService.register(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success(
          'Your organization was created. Sign in to continue.',
          'Registration complete',
        );
        void this.router.navigate(['/login']);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const apiError = toApiError(error);

        // DRF returns per-field errors for the duplicate username/email checks,
        // so route them back to the right input.
        const mapped: Record<string, string> = {};
        for (const [key, messages] of Object.entries(apiError.fieldErrors)) {
          if (messages.length > 0) {
            mapped[key] = messages[0]!;
          }
        }
        this.fieldErrors.set(mapped);
        this.errorMessage.set(
          Object.keys(mapped).length > 0 ? 'Some details need attention.' : apiError.message,
        );
      },
    });
  }
}
