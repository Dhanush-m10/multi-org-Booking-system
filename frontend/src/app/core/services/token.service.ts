import { Injectable, computed, signal } from '@angular/core';

import type { SessionUser } from '../models/api.models';

/**
 * The single place that touches the JWT tokens.
 *
 * Nothing else in the app reads or writes `localStorage` directly: services go
 * through here, the auth interceptor goes through here, and logout clears
 * everything through here. That is what keeps token handling from being
 * duplicated (or leaking into a template).
 *
 * Storage choice: `localStorage`. It is the pragmatic option for this project
 * because the refresh token has to survive a hard reload and the backend issues
 * the refresh token to the browser in the first place. The trade-off — tokens
 * are readable by any script on the origin — is a known one; switching to
 * httpOnly cookies would be a backend change. Tokens are never rendered in the
 * UI.
 *
 * This service is deliberately free of `HttpClient` so it can be injected into
 * the interceptors without creating a circular dependency.
 */

const ACCESS_KEY = 'mob.access_token';
const REFRESH_KEY = 'mob.refresh_token';
const USER_KEY = 'mob.session_user';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private-browsing modes can throw on access; behave as "no token".
    return null;
  }
}

function readUser(): SessionUser | null {
  const raw = read(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (typeof parsed.username !== 'string') {
      return null;
    }
    return {
      id: Number(parsed.id) || 0,
      username: parsed.username,
      email: typeof parsed.email === 'string' ? parsed.email : '',
      // Role and organization come from GET /api/auth/me/. They are optional so
      // a session stored by an older build still parses, and they are display
      // metadata only — the backend authorizes every request from the token.
      role: parsed.role ?? null,
      organizationName: typeof parsed.organizationName === 'string' ? parsed.organizationName : '',
      organizationSlug: parsed.organizationSlug ?? null,
    };
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class TokenService {
  /** Signals (not plain fields) so the zoneless app re-renders on change. */
  private readonly _accessToken = signal<string | null>(read(ACCESS_KEY));
  private readonly _refreshToken = signal<string | null>(read(REFRESH_KEY));
  private readonly _user = signal<SessionUser | null>(readUser());

  readonly accessToken = this._accessToken.asReadonly();
  readonly refreshToken = this._refreshToken.asReadonly();
  readonly user = this._user.asReadonly();

  /** True when we hold an access token. Not a guarantee it is unexpired —
   *  an expired token is detected and refreshed by the auth interceptor. */
  readonly isAuthenticated = computed(() => this._accessToken() !== null);

  readonly displayName = computed(() => this._user()?.username ?? '');

  /** Organization role from `GET /api/auth/me/`, or null before it resolves. */
  readonly role = computed(() => this._user()?.role ?? null);

  /**
   * True for a self-registered customer. Drives navigation only: which portal
   * a signed-in user is sent to. It is not a permission — a customer reaching a
   * management screen would get 403 from every endpoint, and a staff user
   * editing localStorage to claim CUSTOMER would only hide links from
   * themselves.
   */
  readonly isCustomer = computed(() => this._user()?.role === 'CUSTOMER');

  readonly organizationName = computed(() => this._user()?.organizationName ?? '');

  /**
   * The signed-in user's organization slug. Used to build public-API links
   * (`/book/<slug>`, the public catalogue). It is the user's own organization as
   * reported by `GET /api/auth/me/` — never a value the visitor typed, and never
   * sent as an authorization claim.
   */
  readonly organizationSlug = computed(() => this._user()?.organizationSlug ?? '');

  setTokens(access: string, refresh: string): void {
    this.persist(ACCESS_KEY, access);
    this.persist(REFRESH_KEY, refresh);
    this._accessToken.set(access);
    this._refreshToken.set(refresh);
  }

  /** Used after a successful refresh, which only returns a new access token. */
  setAccessToken(access: string): void {
    this.persist(ACCESS_KEY, access);
    this._accessToken.set(access);
  }

  setUser(user: SessionUser): void {
    this.persist(USER_KEY, JSON.stringify(user));
    this._user.set(user);
  }

  /** Drop everything. Called on logout and whenever a refresh fails. */
  clear(): void {
    for (const key of [ACCESS_KEY, REFRESH_KEY, USER_KEY]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
  }

  private persist(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }
}
