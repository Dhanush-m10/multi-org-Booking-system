import { HttpErrorResponse, HttpHeaders, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { toApiError } from '../utils/api-errors';
import { SessionExpiredError } from './auth.interceptor';
import { ToastService } from '../services/toast.service';

/**
 * Centralised HTTP error reporting.
 *
 * Registered BEFORE `authInterceptor` in `withInterceptors([...])`. Interceptor
 * responses travel in reverse order, so this ordering means:
 *
 *   backend error -> authInterceptor (retries a 401 after refreshing)
 *                 -> errorInterceptor (only sees errors that survived)
 *
 * A 401 that was successfully refreshed never reaches here; a 401 that could
 * not be refreshed arrives as `SessionExpiredError` and gets one clear toast.
 *
 * Deliberately NOT handled here:
 *  - 400 validation errors. Forms own those, because the messages belong next
 *    to the offending input (see `toApiError().fieldErrors`).
 *  - Requests tagged `X-Silent-Error`, which render their own error state.
 */

const SILENT_HEADER = 'X-Silent-Error';

export const errorInterceptor: HttpInterceptorFn = (rawReq, next) => {
  const toast = inject(ToastService);

  const silent = rawReq.headers.has(SILENT_HEADER);
  const req = silent ? rawReq.clone({ headers: rawReq.headers.delete(SILENT_HEADER) }) : rawReq;

  return next(req).pipe(
    catchError((error: unknown) => {
      if (silent) {
        return throwError(() => error);
      }

      if (error instanceof SessionExpiredError) {
        toast.error(error.message, 'Session expired');
        return throwError(() => error);
      }

      if (error instanceof HttpErrorResponse) {
        // 400 -> forms, 401 -> authInterceptor. Everything else gets a toast.
        if (error.status !== 400 && error.status !== 401) {
          const apiError = toApiError(error);
          toast.error(apiError.message, titleForStatus(apiError.status));
        }
      }

      return throwError(() => error);
    }),
  );
};

function titleForStatus(status: number): string {
  if (status === 0) return 'Connection problem';
  if (status === 403) return 'Access denied';
  if (status === 404) return 'Not found';
  if (status >= 500) return 'Server error';
  return 'Request failed';
}

/**
 * Marks a request so the global handler stays quiet about it.
 * Useful for background polling or optional side-loads where the screen
 * already shows its own empty/error state.
 *
 *   this.http.get(url, { headers: silent() })
 */
export function silent(): HttpHeaders {
  return new HttpHeaders({ [SILENT_HEADER]: '1' });
}
