import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

/** What GET /api/auth/me/ returns for an organization admin. */
const ADMIN_ME = {
  id: 1,
  username: 'orga_admin',
  email: 'admin@example.com',
  first_name: '',
  last_name: '',
  organization: { id: 1, name: 'Acme Clinic', slug: 'acme-clinic' },
  role: 'ADMIN',
  customer_id: null,
};

import { LoginComponent } from './login';
import { TokenService } from '../../../core/services/token.service';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let backend: HttpTestingController;
  let router: Router;
  let tokens: TokenService;

  const root = () => fixture.nativeElement as HTMLElement;
  const input = (id: string) => root().querySelector<HTMLInputElement>(`#${id}`)!;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'dashboard', component: TestPageComponent },
          { path: 'login', component: TestPageComponent },
          { path: 'register', component: TestPageComponent },
        ]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    tokens = TestBed.inject(TokenService);
    fixture.detectChanges();
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('renders a labelled, accessible form', () => {
    expect(input('login-username')).toBeTruthy();
    expect(input('login-password')).toBeTruthy();
    expect(input('login-password').type).toBe('password');
    expect(root().textContent).toContain('Sign in to your organization workspace');
  });

  it('toggles the password between hidden and visible', async () => {
    const toggle = root().querySelector<HTMLButtonElement>('[aria-label="Show password"]')!;
    expect(toggle).toBeTruthy();

    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input('login-password').type).toBe('text');
    expect(root().querySelector('[aria-label="Hide password"]')).toBeTruthy();
  });

  it('shows a validation message instead of calling the API', async () => {
    const form = root().querySelector('form')!;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(root().textContent).toContain('Username is required.');
    backend.expectNone('/api/auth/login/');
  });

  it('shows the backend message when credentials are wrong', async () => {
    input('login-username').value = 'orga_admin';
    input('login-username').dispatchEvent(new Event('input'));
    input('login-password').value = 'wrong-password';
    input('login-password').dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const req = backend.expectOne('/api/auth/login/');
    expect(req.request.body).toEqual({
      username: 'orga_admin',
      password: 'wrong-password',
    });

    req.flush(
      { detail: 'No active account found with the given credentials' },
      { status: 401, statusText: 'Unauthorized' },
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(root().textContent).toContain('No active account found with the given credentials');
    expect(tokens.isAuthenticated()).toBe(false);
  });

  it('stores the tokens and navigates to the dashboard on success', async () => {
    input('login-username').value = 'orga_admin';
    input('login-username').dispatchEvent(new Event('input'));
    input('login-password').value = 'StrongPass123!';
    input('login-password').dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    backend.expectOne('/api/auth/login/').flush({ access: 'the-access', refresh: 'the-refresh' });
    fixture.detectChanges();

    // Login now resolves the real identity via GET /api/auth/me/ so the guards
    // can tell an admin from a customer. Flush it, or verify() will report it
    // as an open request.
    backend.expectOne('/api/auth/me/').flush(ADMIN_ME);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(tokens.accessToken()).toBe('the-access');
    expect(router.url).toBe('/dashboard');
  });

  it('records the role reported by /api/auth/me/', async () => {
    input('login-username').value = 'orga_admin';
    input('login-username').dispatchEvent(new Event('input'));
    input('login-password').value = 'StrongPass123!';
    input('login-password').dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    backend.expectOne('/api/auth/login/').flush({ access: 'the-access', refresh: 'the-refresh' });
    fixture.detectChanges();
    backend.expectOne('/api/auth/me/').flush(ADMIN_ME);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(tokens.role()).toBe('ADMIN');
    expect(tokens.organizationName()).toBe('Acme Clinic');
  });

  it('still signs the user in when /api/auth/me/ fails', async () => {
    input('login-username').value = 'orga_admin';
    input('login-username').dispatchEvent(new Event('input'));
    input('login-password').value = 'StrongPass123!';
    input('login-password').dispatchEvent(new Event('input'));
    fixture.detectChanges();

    root().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    backend.expectOne('/api/auth/login/').flush({ access: 'the-access', refresh: 'the-refresh' });
    fixture.detectChanges();
    // A failed identity lookup must not undo a successful login: the session is
    // valid, and the guards fall back to their unproven-role behaviour.
    backend
      .expectOne('/api/auth/me/')
      .flush({ detail: 'nope' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(tokens.accessToken()).toBe('the-access');
    expect(tokens.isAuthenticated()).toBe(true);
    expect(router.url).toBe('/dashboard');
  });
});
