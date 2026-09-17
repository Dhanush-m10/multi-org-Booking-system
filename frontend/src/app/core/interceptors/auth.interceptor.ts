import {
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  map,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import type { RefreshResponse } from '../models/api.models';
import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';

/**
 * Attaches `Authorization: Bearer <access>` and transparently refreshes an
 * expired access token.
 *
 * Guarantees:
 *  - No service ever has to pass a JWT by hand.
 *  - Login / register / refresh requests are sent anonymously, so a stale token
 *    can never cause those calls to fail.
 *  - Concurrent 401s share ONE refresh request (`refreshInFlight`), so five
 *    simultaneous dashboard calls produce a single POST /auth/refresh/.
 *  - Each original request may be retried at most once (`retried` below), which
 *    is what prevents an infinite refresh loop. A closure flag is used rather
 *    than a marker header because `next()` hands off to the backend directly —
 *    the chain does not re-enter this interceptor, so a header would never be
 *    seen again and would leak to the server.
 *  - If the refresh itself fails, the session is cleared and the user is sent
 *    to /login with a `returnUrl` so they land back where they were.
 */

/** Shared in-flight refresh, or null when no refresh is running. */
let refreshInFlight: Observable<string> | null = null;

function isAnonymousEndpoint(url: string): boolean {
  return AuthService.anonymousUrls.some((path) => url.endsWith(path));
}

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    headers: req.headers.set('Authorization', `Bearer ${token}`),
  });
}

/**
 * Thrown when the refresh token is missing or expired. `error.interceptor.ts`
 * recognises this type so it can report "session expired" instead of the
 * generic 401 wording that the login endpoint produces.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const http = inject(HttpClient);
  const router = inject(Router);

  /** Per-request guard: one refresh-and-retry, never two. */
  let retried = false;

  const skipAuth = isAnonymousEndpoint(req.url);
  const access = tokenService.accessToken();

  const outgoing = !skipAuth && access ? withBearer(req, access) : req;

  /** Perform exactly one refresh, shared by every concurrent caller. */
  const refreshOnce = (): Observable<string> => {
    if (!refreshInFlight) {
      refreshInFlight = http
        .post<RefreshResponse>(`${environment.apiBaseUrl}/auth/refresh/`, {
          refresh: tokenService.refreshToken(),
        })
        .pipe(
          map((response) => response.access),
          // Persist it, otherwise the very next request would send the stale
          // token again and trigger another refresh round trip.
          tap((access) => tokenService.setAccessToken(access)),
          shareReplay({ bufferSize: 1, refCount: true }),
          finalize(() => {
            refreshInFlight = null;
          }),
        );
    }
    return refreshInFlight;
  };

  const endSession = (): Observable<never> => {
    tokenService.clear();
    void router.navigate(['/login'], {
      queryParams: { returnUrl: router.url },
    });
    return throwError(() => new SessionExpiredError());
  };

  const handleUnauthorized = (): Observable<HttpEvent<unknown>> => {
    // Nothing to refresh with, or this exact request was already retried:
    // the session is genuinely over.
    if (!tokenService.refreshToken() || retried) {
      return endSession();
    }
    retried = true;

    return refreshOnce().pipe(
      switchMap((newToken) => next(withBearer(req, newToken))),
      catchError(() => endSession()),
    );
  };

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !skipAuth) {
        return handleUnauthorized();
      }
      return throwError(() => error);
    }),
  );
};
