import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { TokenService } from '../services/token.service';

/**
 * Route guards.
 *
 * `authGuard`     — protects every screen behind the management shell, and
 *                   turns customers away from it.
 * `customerGuard` — protects the customer-only screens from staff and admins.
 * `guestGuard`    — keeps signed-in users out of /login and /register so they
 *                   cannot accidentally land on an auth screen mid-session.
 *
 * These are a UX convenience only. The real authorization boundary is Django:
 * every queryset is filtered by the organization resolved from the JWT, so a
 * tampered localStorage entry can read nothing it should not. In particular,
 * editing the stored role to claim ADMIN would not expose a single management
 * endpoint — it would only send the user to a shell full of 403s.
 */

/** Where the user was heading before being bounced to /login. */
const RETURN_URL = 'returnUrl';

function signInTree(router: Router, url: string) {
  return router.createUrlTree(['/login'], { queryParams: { [RETURN_URL]: url } });
}

export const authGuard: CanActivateFn = (_route, state) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (!tokenService.isAuthenticated()) {
    return signInTree(router, state.url);
  }

  // A customer has no management screens at all: every endpoint behind this
  // shell is IsOrganizationAdmin or IsOrganizationStaff, both of which exclude
  // the CUSTOMER role. Sending one here would render a sidebar of 403s, so they
  // go to their own portal instead.
  if (tokenService.isCustomer()) {
    return router.createUrlTree(['/customer/bookings']);
  }

  return true;
};

/**
 * The customer portal. Staff and admins are sent to the dashboard — they manage
 * bookings there, and the customer endpoints require the CUSTOMER role, so the
 * two audiences never share a screen.
 *
 * A session whose role is not yet known is let through: the endpoints decide
 * what it may actually see, and blocking on an unproven role would lock out a
 * genuine customer after a reload.
 */
export const customerGuard: CanActivateFn = (_route, state) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (!tokenService.isAuthenticated()) {
    return signInTree(router, state.url);
  }

  if (tokenService.role() !== null && !tokenService.isCustomer()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};

export const guestGuard: CanActivateFn = () => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (!tokenService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(tokenService.isCustomer() ? ['/customer/bookings'] : ['/dashboard']);
};

/** Read (and validate) the returnUrl the guard stashed in the query string. */
export function safeReturnUrl(value: string | null): string {
  // Only allow same-origin absolute paths — never an external URL.
  if (value && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return '/dashboard';
}
