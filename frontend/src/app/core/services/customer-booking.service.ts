import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Booking, CustomerBookingPayload } from '../models/api.models';

/**
 * A signed-in customer's own bookings.
 *
 *   GET  /api/customer/bookings/            the caller's bookings only
 *   POST /api/customer/bookings/            create one for the caller
 *   POST /api/customer/bookings/:id/cancel/ cancel one of the caller's own
 *
 * These are separate from `BookingService` on purpose. That service targets
 * `/api/bookings/`, which requires `IsOrganizationStaff` and is the
 * organization's management view of every booking it holds. A customer must not
 * reach it, and it must not be loosened to let them.
 *
 * What is NOT here, by design:
 *  - no `getOne` — the detail route exists on the backend but the customer UI
 *    has no use for it, and not offering it keeps the surface small
 *  - no `update` / `setStatus` — a customer cannot reschedule, reassign staff or
 *    mark a booking completed or no-show. Cancellation is the only mutation.
 *
 * `CustomerBookingPayload` carries no `customer`, `organization` or `status`
 * field: the backend derives the first two from the token and pins the third to
 * PENDING, so there is nothing here to send.
 */
@Injectable({ providedIn: 'root' })
export class CustomerBookingService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/customer/bookings/`;

  /** Filtered to the caller on the server. Never filtered in the component. */
  getAll(): Observable<Booking[]> {
    return this.http.get<Booking[]>(this.url);
  }

  create(payload: CustomerBookingPayload): Observable<Booking> {
    return this.http.post<Booking>(this.url, payload);
  }

  /**
   * Cancel one of the caller's bookings.
   *
   * The backend returns 404 if the booking belongs to someone else and 400 if
   * its status makes cancellation meaningless (already cancelled, completed or
   * no-show). Both are surfaced to the user rather than hidden.
   */
  cancel(id: number): Observable<Booking> {
    return this.http.post<Booking>(`${this.url}${id}/cancel/`, {});
  }
}
