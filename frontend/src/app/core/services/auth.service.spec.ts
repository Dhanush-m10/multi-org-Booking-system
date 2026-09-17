import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/**
 * Pins the contract of the existing Django auth endpoints:
 *   POST /api/auth/login/    -> { access, refresh }
 *   POST /api/auth/register/ -> { id, username, email }   (no tokens)
 * and that registration therefore does NOT create a session.
 */
describe('AuthService', () => {
  let service: AuthService;
  let tokens: TokenService;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(AuthService);
    tokens = TestBed.inject(TokenService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('posts credentials to /api/auth/login/ and stores both tokens', () => {
    let emitted: unknown;
    service
      .login({ username: 'orga_admin', password: 'StrongPass123!' })
      .subscribe((value) => (emitted = value));

    const req = backend.expectOne('/api/auth/login/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      username: 'orga_admin',
      password: 'StrongPass123!',
    });

    req.flush({ access: 'the-access', refresh: 'the-refresh' });

    expect(emitted).toEqual({ access: 'the-access', refresh: 'the-refresh' });
    expect(tokens.accessToken()).toBe('the-access');
    expect(tokens.refreshToken()).toBe('the-refresh');
    expect(tokens.isAuthenticated()).toBe(true);
  });

  it('records the signed-in username for display only', () => {
    service.login({ username: 'orga_admin', password: 'x' }).subscribe();
    backend.expectOne('/api/auth/login/').flush({ access: 'a', refresh: 'r' });

    expect(tokens.user()?.username).toBe('orga_admin');
  });

  it('registers without creating a session, because the endpoint returns no tokens', () => {
    let created: unknown;
    service
      .register({
        username: 'newuser',
        email: 'new@example.com',
        password: 'StrongPass123!',
        organization_name: 'New Org',
        organization_email: 'org@example.com',
        organization_phone: '555',
        organization_address: '1 Road',
      })
      .subscribe((value) => (created = value));

    const req = backend.expectOne('/api/auth/register/');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 7, username: 'newuser', email: 'new@example.com' });

    expect(created).toEqual({ id: 7, username: 'newuser', email: 'new@example.com' });
    expect(tokens.isAuthenticated()).toBe(false);
    expect(tokens.accessToken()).toBeNull();
  });

  it('sends only the refresh token when refreshing', () => {
    tokens.setTokens('old-access', 'the-refresh');

    service.refresh().subscribe();

    const req = backend.expectOne('/api/auth/refresh/');
    expect(req.request.body).toEqual({ refresh: 'the-refresh' });
    req.flush({ access: 'rotated-access' });

    expect(tokens.accessToken()).toBe('rotated-access');
    // The backend does not rotate the refresh token.
    expect(tokens.refreshToken()).toBe('the-refresh');
  });

  it('clears everything on logout', () => {
    tokens.setTokens('a', 'r');
    tokens.setUser({ id: 1, username: 'orga_admin', email: '' });

    service.logout(false);

    expect(tokens.accessToken()).toBeNull();
    expect(tokens.refreshToken()).toBeNull();
    expect(tokens.user()).toBeNull();
    expect(localStorage.getItem('mob.access_token')).toBeNull();
  });
});
