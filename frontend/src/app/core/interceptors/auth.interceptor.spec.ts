import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

/** Stand-in target for the "session expired" redirect. */
@Component({ selector: 'app-test-login', template: '' })
class TestLoginComponent {}

import { SessionExpiredError, authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { TokenService } from '../services/token.service';

/**
 * The auth interceptor is the single place a JWT is attached and the only place
 * a 401 is retried, so these tests pin down the three guarantees that matter:
 *
 *  1. every non-anonymous request carries `Authorization: Bearer <access>`
 *  2. an expired access token triggers exactly ONE refresh, then a retry with
 *     the new token
 *  3. a failed refresh ends the session instead of looping
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let tokenService: TokenService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', component: TestLoginComponent }]),
      ],
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    tokenService = TestBed.inject(TokenService);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('attaches the bearer token to an API request', () => {
    tokenService.setTokens('access-token', 'refresh-token');

    http.get('/api/services/').subscribe();

    const req = backend.expectOne('/api/services/');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
    req.flush([]);
  });

  it('does not send a stale token to the login endpoint', () => {
    tokenService.setTokens('access-token', 'refresh-token');

    http.post('/api/auth/login/', { username: 'a', password: 'b' }).subscribe();

    const req = backend.expectOne('/api/auth/login/');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ access: 'new', refresh: 'new-refresh' });
  });

  it('refreshes once on 401 and retries with the new token', () => {
    tokenService.setTokens('expired-token', 'refresh-token');

    let received: unknown;
    http.get('/api/services/').subscribe((value) => (received = value));

    // 1. the original request goes out with the expired token
    const original = backend.expectOne('/api/services/');
    expect(original.request.headers.get('Authorization')).toBe('Bearer expired-token');
    original.flush(
      { detail: 'Given token not valid for any token type' },
      { status: 401, statusText: 'Unauthorized' },
    );

    // 2. exactly one refresh call
    const refresh = backend.expectOne('/api/auth/refresh/');
    expect(refresh.request.body).toEqual({ refresh: 'refresh-token' });
    refresh.flush({ access: 'fresh-token' });

    // 3. the retry carries the fresh token and no internal marker leaks to Django
    const retry = backend.expectOne('/api/services/');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    expect(retry.request.headers.has('X-Auth-Retry')).toBe(false);
    retry.flush([{ id: 1, name: 'Haircut' }]);

    expect(received).toEqual([{ id: 1, name: 'Haircut' }]);
    expect(tokenService.accessToken()).toBe('fresh-token');
  });

  it('ends the session when the refresh token is also rejected (no loop)', () => {
    tokenService.setTokens('expired-token', 'dead-refresh-token');

    let caught: unknown;
    http.get('/api/services/').subscribe({ error: (error) => (caught = error) });

    backend
      .expectOne('/api/services/')
      .flush({ detail: 'Token is invalid' }, { status: 401, statusText: 'Unauthorized' });

    backend
      .expectOne('/api/auth/refresh/')
      .flush({ detail: 'Token is invalid' }, { status: 401, statusText: 'Unauthorized' });

    expect(caught).toBeInstanceOf(SessionExpiredError);
    expect(tokenService.accessToken()).toBeNull();
    expect(tokenService.refreshToken()).toBeNull();
    // `backend.verify()` in afterEach proves no retry was attempted.
  });

  it('retries only once, then ends the session, when the retried call also 401s', () => {
    tokenService.setTokens('expired-token', 'refresh-token');

    let caught: unknown;
    http.get('/api/services/').subscribe({ error: (error) => (caught = error) });

    // 1. original request rejected
    backend
      .expectOne('/api/services/')
      .flush({ detail: 'invalid' }, { status: 401, statusText: 'Unauthorized' });

    // 2. one refresh, which succeeds
    backend.expectOne('/api/auth/refresh/').flush({ access: 'fresh-token' });

    // 3. the retry is ALSO rejected — this must not trigger a second refresh
    backend
      .expectOne('/api/services/')
      .flush({ detail: 'still invalid' }, { status: 401, statusText: 'Unauthorized' });

    expect(caught).toBeInstanceOf(SessionExpiredError);
    expect(tokenService.accessToken()).toBeNull();
    backend.expectNone('/api/auth/refresh/');
    backend.expectNone('/api/services/');
  });

  it('clears the session without calling refresh when there is no refresh token', () => {
    localStorage.setItem('mob.access_token', 'lonely-access');
    tokenService.setAccessToken('lonely-access');

    let caught: unknown;
    http.get('/api/services/').subscribe({ error: (error) => (caught = error) });

    backend
      .expectOne('/api/services/')
      .flush({ detail: 'Token is invalid' }, { status: 401, statusText: 'Unauthorized' });

    expect(caught).toBeInstanceOf(SessionExpiredError);
    expect(tokenService.isAuthenticated()).toBe(false);
  });

  it('shares one refresh across concurrent 401s', () => {
    tokenService.setTokens('expired-token', 'refresh-token');

    http.get('/api/services/').subscribe();
    http.get('/api/customers/').subscribe();

    backend
      .expectOne('/api/services/')
      .flush({ detail: 'invalid' }, { status: 401, statusText: 'Unauthorized' });
    backend
      .expectOne('/api/customers/')
      .flush({ detail: 'invalid' }, { status: 401, statusText: 'Unauthorized' });

    // Only ONE refresh for two failed requests.
    const refresh = backend.expectOne('/api/auth/refresh/');
    refresh.flush({ access: 'fresh-token' });

    backend.expectNone('/api/auth/refresh/');

    for (const url of ['/api/services/', '/api/customers/']) {
      const retry = backend.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
      retry.flush([]);
    }
  });
});
