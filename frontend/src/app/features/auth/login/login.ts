import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { Router } from '@angular/router';

import {
  AuthService
} from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './login.html'
})
export class LoginComponent {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  errorMessage = '';
  isLoading = false;

  loginForm = this.fb.nonNullable.group({

    username: [
      '',
      Validators.required
    ],

    password: [
      '',
      Validators.required
    ]

  });

  onSubmit(): void {

    if (this.loginForm.invalid) {

      this.loginForm.markAllAsTouched();

      return;
    }

    this.errorMessage = '';
    this.isLoading = true;

    this.authService
      .login(this.loginForm.getRawValue())
      .subscribe({

        next: () => {

          this.isLoading = false;

          this.router.navigate(['/dashboard']);

        },

        error: (error) => {

          this.isLoading = false;

          console.error(
            'Login error:',
            error
          );

          this.errorMessage =
            'Invalid username or password.';

        }

      });

  }

}