import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { TokenService } from '../services/token.service';

/**
 * Route guards.
 *
 * `authGuard`   — protects every screen behind the app shell.
 * `guestGuard`  — keeps signed-in users out of /login and /register so they
 *                 cannot accidentally land on an auth screen mid-session.
 *
 * These are a UX convenience only. The real authorization boundary is Django:
 * every queryset is filtered by the organization resolved from the JWT, so a
 * tampered localStorage entry can read nothing it should not.
 */

/** Where the user was heading before being bounced to /login. */
const RETURN_URL = 'returnUrl';

export const authGuard: CanActivateFn = (_route, state) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (tokenService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { [RETURN_URL]: state.url },
  });
};

export const guestGuard: CanActivateFn = () => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  return tokenService.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};

/** Read (and validate) the returnUrl the guard stashed in the query string. */
export function safeReturnUrl(value: string | null): string {
  // Only allow same-origin absolute paths — never an external URL.
  if (value && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return '/dashboard';
}
