import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  AvailabilitySlotsResponse,
  PublicOrganization,
  PublicService,
  PublicStaff,
  PublicWorkingHours,
} from '../models/api.models';

/**
 * The public, unauthenticated customer-facing API.
 *
 *   GET /api/public/organizations/<slug>/
 *   GET /api/public/organizations/<slug>/services/
 *   GET /api/public/organizations/<slug>/staff/
 *   GET /api/public/organizations/<slug>/availability/
 *   GET /api/public/organizations/<slug>/availability/slots/?service=&staff=&date=
 *
 * All of these are `AllowAny` on the backend and return only active, published
 * records for the one organization named by the slug. There is no request in
 * this service that accepts an organization id: the slug from the URL is the
 * only selector, and it is echoed straight back to the server.
 *
 * Nothing here needs a token, and none of it can reach another organization's
 * data — the backend filters every queryset by the organization it resolved
 * from the slug.
 */
@Injectable({ providedIn: 'root' })
export class PublicOrganizationService {
  private readonly http = inject(HttpClient);

  private base(slug: string): string {
    // encodeURIComponent so an unusual slug cannot break out of the path.
    return `${environment.apiBaseUrl}/public/organizations/${encodeURIComponent(slug)}/`;
  }

  /** Public profile: name, address, phone, email. No members, no customers. */
  getOrganization(slug: string): Observable<PublicOrganization> {
    return this.http.get<PublicOrganization>(this.base(slug));
  }

  /** Active services only. */
  getServices(slug: string): Observable<PublicService[]> {
    return this.http.get<PublicService[]>(`${this.base(slug)}services/`);
  }

  /** Active staff only, with the service ids each one performs. No contact details. */
  getStaff(slug: string): Observable<PublicStaff[]> {
    return this.http.get<PublicStaff[]>(`${this.base(slug)}staff/`);
  }

  /** Working hours for active staff, `is_available` rows only. */
  getWorkingHours(slug: string): Observable<PublicWorkingHours[]> {
    return this.http.get<PublicWorkingHours[]>(`${this.base(slug)}availability/`);
  }

  /**
   * Real bookable slots for one service + staff member + date.
   *
   * The server derives these from the staff member's working hours, the service
   * duration and their existing non-cancelled bookings — it is not a
   * client-side calculation, so what is offered is what the server will accept
   * (subject to someone else booking in the meantime, which the create call
   * still rejects).
   */
  getSlots(
    slug: string,
    params: { service: number; staff: number; date: string },
  ): Observable<AvailabilitySlotsResponse> {
    return this.http.get<AvailabilitySlotsResponse>(`${this.base(slug)}availability/slots/`, {
      params: new HttpParams()
        .set('service', params.service)
        .set('staff', params.staff)
        .set('date', params.date),
    });
  }
}
