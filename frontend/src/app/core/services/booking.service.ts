import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  Booking,
  BookingPayload,
  BookingStatus,
  BookingStatusPayload,
} from '../models/api.models';

/**
 * Bookings — the core of the app.
 *
 *   GET|POST          /api/bookings/
 *   GET|PUT|PATCH     /api/bookings/:id/     (DELETE returns 405)
 *
 * Rules enforced by `BookingSerializer.validate` (the frontend surfaces these
 * messages, it does not re-implement them):
 *  - customer / service / staff must belong to the caller's organization
 *  - the staff member must actually offer the service
 *  - booking_date cannot be in the past
 *  - the slot must fall inside the staff member's working hours for that weekday
 *  - the slot must not overlap an existing non-cancelled booking
 *  - `end_time` is read-only and derived from `service.duration_minutes`
 *
 * A status/notes-only PATCH deliberately skips the availability re-check, which
 * is why `updateStatus` exists as its own method.
 */
@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/bookings/`;

  getAll(): Observable<Booking[]> {
    return this.http.get<Booking[]>(this.url);
  }

  getOne(id: number): Observable<Booking> {
    return this.http.get<Booking>(`${this.url}${id}/`);
  }

  create(payload: BookingPayload): Observable<Booking> {
    return this.http.post<Booking>(this.url, payload);
  }

  /**
   * Confirm / cancel / complete / mark-no-show, and edit notes.
   * Sends only `status` and/or `notes` so the backend takes its fast path.
   */
  update(id: number, payload: BookingStatusPayload): Observable<Booking> {
    return this.http.patch<Booking>(`${this.url}${id}/`, payload);
  }

  /** Convenience wrapper used by the status action buttons. */
  setStatus(id: number, status: BookingStatus): Observable<Booking> {
    return this.update(id, { status });
  }
}

/** Statuses the detail view can move a booking to, with their UI labels. */
export const BOOKING_STATUS_ACTIONS: ReadonlyArray<{
  status: BookingStatus;
  label: string;
  tone: 'primary' | 'danger' | 'success' | 'neutral';
}> = [
  { status: 'CONFIRMED', label: 'Confirm booking', tone: 'success' },
  { status: 'COMPLETED', label: 'Mark completed', tone: 'primary' },
  { status: 'NO_SHOW', label: 'Mark no show', tone: 'neutral' },
  { status: 'CANCELLED', label: 'Cancel booking', tone: 'danger' },
];
