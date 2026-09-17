import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  Service,
  ServiceCategory,
  ServiceCategoryPayload,
  ServicePayload,
} from '../models/api.models';

/**
 * Service catalogue + service categories.
 *
 *   GET|POST /api/categories/   -> ServiceCategory[]
 *   GET|POST /api/services/     -> Service[]
 *
 * Backend reality that shapes this service:
 *  - Only list + create exist. There is no detail route, so no update,
 *    activate/deactivate or delete. The UI must not offer those actions.
 *  - `organization` is read-only; the backend fills it from the JWT. It is
 *    never sent, and there is no organization picker anywhere in the app.
 *  - Responses are plain arrays (no pagination wrapper).
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiBaseUrl;

  /* ------------------------------ categories ----------------------------- */

  getCategories(): Observable<ServiceCategory[]> {
    return this.http.get<ServiceCategory[]>(`${this.url}/categories/`);
  }

  createCategory(payload: ServiceCategoryPayload): Observable<ServiceCategory> {
    return this.http.post<ServiceCategory>(`${this.url}/categories/`, payload);
  }

  /* -------------------------------- services ----------------------------- */

  getServices(): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.url}/services/`);
  }

  createService(payload: ServicePayload): Observable<Service> {
    return this.http.post<Service>(`${this.url}/services/`, payload);
  }
}
