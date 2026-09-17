import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Customer, CustomerPayload } from '../models/api.models';

/**
 * Customer directory.
 *
 *   GET|POST /api/customers/   -> Customer[]
 *
 * List + create only. Note the model has a unique constraint on
 * (organization, email), so a duplicate email comes back as
 * `{ "email": ["customer with this email already exists."] }` — the create form
 * renders that next to the field.
 */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/customers/`;

  getAll(): Observable<Customer[]> {
    return this.http.get<Customer[]>(this.url);
  }

  create(payload: CustomerPayload): Observable<Customer> {
    return this.http.post<Customer>(this.url, payload);
  }
}
