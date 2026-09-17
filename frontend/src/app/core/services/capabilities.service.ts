import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * What the signed-in user is actually allowed to do.
 *
 * WHY THIS EXISTS
 * ---------------
 * The backend splits its permissions in two:
 *
 *   /api/categories/     IsOrganizationAdmin
 *   /api/services/       IsOrganizationAdmin
 *   /api/staff/          IsOrganizationAdmin
 *   /api/working-hours/  IsOrganizationAdmin
 *   /api/customers/      IsOrganizationStaff
 *   /api/bookings/       IsOrganizationStaff
 *
 * so a user whose `OrganizationMembership.role` is STAFF gets **403** on
 * services, staff and availability. Without this service the sidebar offers
 * those three links to every signed-in user and a STAFF user lands on three
 * screens that can only ever show an error.
 *
 * HOW THE ROLE IS DETERMINED
 * --------------------------
 * There is no `/api/me` endpoint and the JWT payload carries only
 * `token_type, exp, iat, jti, user_id` — no role, no organization. So the role
 * cannot be read; it can only be *observed*. This service issues one silent
 * request to an admin-only endpoint and records the status code:
 *
 *   200 -> ADMIN (or at least: permitted to manage the catalogue)
 *   403 -> STAFF
 *
 * This is an inference from real HTTP responses, not a guess and not a second
 * source of truth. It is used only to decide which navigation links to render.
 * It is never a security boundary — the backend re-checks every request and
 * would reject an unauthorized one regardless of what the sidebar showed.
 *
 * THE PROPER FIX (backend)
 * ------------------------
 * A `GET /api/me/` returning `{ id, username, email, organization: {id, name},
 * role }` would make this file unnecessary and would also allow the header to
 * show the organization name, which is currently impossible to obtain.
 */
@Injectable({ providedIn: 'root' })
export class CapabilitiesService {
  private readonly http = inject(HttpClient);

  /**
   * `null` while unknown (probe not yet answered), then `true`/`false`.
   * Keeping the tri-state means the UI can avoid flickering admin links at a
   * STAFF user before the probe resolves.
   */
  readonly canManageCatalogue = signal<boolean | null>(null);

  /** True once the probe has answered, so callers can skip repeat probes. */
  readonly resolved = signal(false);

  private probing = false;

  /**
   * Ask the backend whether this user may manage services/staff/availability.
   * Safe to call repeatedly: only the first call hits the network.
   */
  probe(): void {
    if (this.resolved() || this.probing) {
      return;
    }
    this.probing = true;

    // `X-Silent-Error` stops the error interceptor from raising a toast for
    // what is, here, an expected and informative 403.
    this.http
      .get(`${environment.apiBaseUrl}/services/`, {
        headers: new HttpHeaders({ 'X-Silent-Error': '1' }),
        responseType: 'text',
      })
      .subscribe({
        next: () => this.finish(true),
        error: (error: { status?: number }) =>
          // 403 is the answer we are looking for. Anything else (network
          // failure, 401 after logout) leaves the capability unknown rather
          // than wrongly claiming the user is a STAFF member.
          this.finish(error?.status === 403 ? false : null),
      });
  }

  /** Clear on logout so the next user is probed afresh. */
  reset(): void {
    this.probing = false;
    this.resolved.set(false);
    this.canManageCatalogue.set(null);
  }

  private finish(result: boolean | null): void {
    this.probing = false;
    this.canManageCatalogue.set(result);
    this.resolved.set(result !== null);
  }
}
