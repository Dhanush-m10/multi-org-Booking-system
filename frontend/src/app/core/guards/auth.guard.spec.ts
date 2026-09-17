import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { authGuard, guestGuard, safeReturnUrl } from './auth.guard';
import { TokenService } from '../services/token.service';

const ROUTE = {} as ActivatedRouteSnapshot;
const state = (url: string) => ({ url }) as RouterStateSnapshot;

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
  });

  describe('guestGuard', () => {
    it('keeps signed-in users out of the login screen', () => {
      tokens.setTokens('a', 'r');

      const result = TestBed.runInInjectionContext(() => guestGuard(ROUTE, state('/login')));

      expect(result).not.toBe(true);
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
