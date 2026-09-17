import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Staff, StaffPayload } from '../models/api.models';

/**
 * Staff directory.
 *
 *   GET|POST /api/staff/   -> Staff[]
 *
 * `StaffSerializer` returns `services` as an array of service ids; the UI joins
 * them against the service list it already loaded. List + create only — the
 * backend exposes no detail route, so edit / activate / deactivate are not
 * offered in the UI (they would 404).
 */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/staff/`;

  getAll(): Observable<Staff[]> {
    return this.http.get<Staff[]>(this.url);
  }

  create(payload: StaffPayload): Observable<Staff> {
    return this.http.post<Staff>(this.url, payload);
  }
}
