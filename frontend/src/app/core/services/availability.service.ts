import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { WorkingHours, WorkingHoursPayload } from '../models/api.models';

/**
 * Working hours (availability).
 *
 *   GET|POST /api/working-hours/   -> WorkingHours[]
 *
 * Constraints that shape the UI (all enforced by the backend):
 *  - Unique per (staff, weekday). Re-posting the same pair returns
 *    `{ "non_field_errors": ["The fields staff, weekday must make a unique set."] }`.
 *  - `start_time` must be strictly before `end_time`.
 *  - List + create only: a working-hours row cannot be edited or deleted, so
 *    the Availability screen lets you fill in days that have no row yet and
 *    shows existing rows as read-only, with an explanatory note.
 *
 * The backend's booking validator reads these rows to decide whether a slot is
 * bookable, so this data is what makes the booking form's staff picker honest.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/working-hours/`;

  getAll(): Observable<WorkingHours[]> {
    return this.http.get<WorkingHours[]>(this.url);
  }

  create(payload: WorkingHoursPayload): Observable<WorkingHours> {
    return this.http.post<WorkingHours>(this.url, payload);
  }
}
