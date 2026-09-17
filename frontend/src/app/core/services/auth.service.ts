import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  LoginPayload,
  LoginResponse,
  RefreshResponse,
  RegisterPayload,
  RegisteredUser,
} from '../models/api.models';
import { TokenService } from './token.service';

/**
 * Authentication against the existing Django SimpleJWT endpoints.
 *
 *   POST {api}/auth/register/  -> 201 { id, username, email }   (NO tokens)
 *   POST {api}/auth/login/     -> 200 { access, refresh }
 *   POST {api}/auth/refresh/   -> 200 { access }
 *
 * Verified against the running backend: `RegisterSerializer.to_representation`
 * returns only id/username/email, so registration does NOT log the user in.
 * The register page therefore redirects to /login instead of assuming tokens.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);

  /** Single source of truth for the auth URL prefix. */
  private readonly authUrl = `${environment.apiBaseUrl}/auth`;

  /** Exposed so the interceptor can avoid attaching/refreshing on these. */
  static readonly anonymousUrls = ['/auth/login/', '/auth/register/', '/auth/refresh/'];

  /** Read-only view of the session for templates. */
  readonly user = this.tokenService.user;
  readonly isAuthenticated = this.tokenService.isAuthenticated;
  readonly displayName = this.tokenService.displayName;

  /**
   * Exchange credentials for tokens.
   *
   * The backend's JWT payload only contains `user_id`, and there is no
   * `/api/me/` endpoint, so the username/email shown in the header is captured
   * here from the login form. That is display metadata only — the backend
   * re-derives the organization and permissions from the token on every
   * request, so this can never widen access.
   */
  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.authUrl}/login/`, payload).pipe(
      tap((response) => {
        this.tokenService.setTokens(response.access, response.refresh);
        this.tokenService.setUser({
          id: 0,
          username: payload.username,
          email: '',
        });
      }),
    );
  }

  /**
   * Create a user + organization + ADMIN membership in one call.
   * Returns `{ id, username, email }`; the caller must then log in separately.
   */
  register(payload: RegisterPayload): Observable<RegisteredUser> {
    return this.http.post<RegisteredUser>(`${this.authUrl}/register/`, payload);
  }

  /** Exchange the refresh token for a fresh access token. */
  refresh(): Observable<RefreshResponse> {
    const refresh = this.tokenService.refreshToken();
    return this.http
      .post<RefreshResponse>(`${this.authUrl}/refresh/`, { refresh })
      .pipe(tap((response) => this.tokenService.setAccessToken(response.access)));
  }

  /** Clear local state. There is no server-side logout endpoint. */
  logout(redirect = true): void {
    this.tokenService.clear();
    if (redirect) {
      void this.router.navigate(['/login']);
    }
  }
}
