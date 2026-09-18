import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { authGuard, customerGuard, guestGuard, safeReturnUrl } from './auth.guard';
import { TokenService } from '../services/token.service';

const ROUTE = {} as ActivatedRouteSnapshot;
const state = (url: string) => ({ url }) as RouterStateSnapshot;

/** Sign in as the given role, the way AuthService does after GET /api/auth/me/. */
function signInAs(tokens: TokenService, role: 'ADMIN' | 'STAFF' | 'CUSTOMER'): void {
  tokens.setTokens('a', 'r');
  tokens.setUser({
    id: 1,
    username: 'someone',
    email: 'someone@example.test',
    role,
    organizationName: 'Acme Clinic',
    organizationSlug: 'acme-clinic',
  });
}

describe('route guards', () => {
  let tokens: TokenService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    tokens = TestBed.inject(TokenService);
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  describe('authGuard', () => {
    it('allows a signed-in user through', () => {
      tokens.setTokens('a', 'r');

      const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, state('/dashboard')));

      expect(result).toBe(true);
    });

    it('redirects an anonymous user to /login, keeping the destination', () => {
      const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, state('/bookings')));

      expect(result).not.toBe(true);
      const tree = result as ReturnType<Router['createUrlTree']>;
      expect(router.serializeUrl(tree)).toBe('/login?returnUrl=%2Fbookings');
    });

    it('turns a customer away from the management shell', () => {
      // Every endpoint behind the shell is IsOrganizationAdmin or
      // IsOrganizationStaff, so a customer would see a sidebar of 403s.
      signInAs(tokens, 'CUSTOMER');

      const result = TestBed.runInInjectionContext(() => authGuard(ROUTE, state('/dashboard')));

      expect(result).not.toBe(true);
      expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe(
        '/customer/bookings',
      );
    });

    it('still lets admins and staff into the shell', () => {
      for (const role of ['ADMIN', 'STAFF'] as const) {
        signInAs(tokens, role);

        expect(TestBed.runInInjectionContext(() => authGuard(ROUTE, state('/dashboard')))).toBe(
          true,
        );
      }
    });
  });

  describe('customerGuard', () => {
    it('lets a customer into their own portal', () => {
      signInAs(tokens, 'CUSTOMER');

      expect(
        TestBed.runInInjectionContext(() => customerGuard(ROUTE, state('/customer/bookings'))),
      ).toBe(true);
    });

    it('sends an admin to the dashboard instead', () => {
      signInAs(tokens, 'ADMIN');

      const result = TestBed.runInInjectionContext(() =>
        customerGuard(ROUTE, state('/customer/bookings')),
      );

      expect(result).not.toBe(true);
      expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/dashboard');
    });

    it('sends an anonymous visitor to sign in, keeping the destination', () => {
      const result = TestBed.runInInjectionContext(() =>
        customerGuard(ROUTE, state('/customer/bookings')),
      );

      expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe(
        '/login?returnUrl=%2Fcustomer%2Fbookings',
      );
    });

    it('lets a session with an unknown role through rather than locking it out', () => {
      // The endpoints decide what such a session may see; blocking on an
      // unproven role would lock a genuine customer out after a reload.
      tokens.setTokens('a', 'r');

      expect(
        TestBed.runInInjectionContext(() => customerGuard(ROUTE, state('/customer/bookings'))),
      ).toBe(true);
    });
  });

  describe('guestGuard', () => {
    it('keeps signed-in users out of the login screen', () => {
      tokens.setTokens('a', 'r');

      const result = TestBed.runInInjectionContext(() => guestGuard(ROUTE, state('/login')));

      expect(result).not.toBe(true);
    });

    it('sends a signed-in customer to their portal, not the dashboard', () => {
      signInAs(tokens, 'CUSTOMER');

      const result = TestBed.runInInjectionContext(() => guestGuard(ROUTE, state('/login')));

      expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe(
        '/customer/bookings',
      );
    });

    it('lets anonymous users sign in', () => {
      const result = TestBed.runInInjectionContext(() => guestGuard(ROUTE, state('/login')));

      expect(result).toBe(true);
    });
  });

  describe('safeReturnUrl', () => {
    it('accepts a same-origin path', () => {
      expect(safeReturnUrl('/bookings')).toBe('/bookings');
    });

    it.each([['//evil.com/x'], ['https://evil.com'], [''], [null]])(
      'rejects %s and falls back to the dashboard',
      (value) => {
        expect(safeReturnUrl(value)).toBe('/dashboard');
      },
    );
  });
});
