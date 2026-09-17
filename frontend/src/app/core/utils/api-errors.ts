import { HttpErrorResponse } from '@angular/common/http';

/**
 * Centralised HTTP error handling.
 *
 * Every error the app surfaces to a user passes through `toApiError`, so there
 * is exactly one place that knows how Django shapes its error payloads:
 *
 *   400 validation -> { "field": ["msg"], "non_field_errors": ["msg"] }
 *   401/403/404    -> { "detail": "..." }
 *   5xx            -> HTML page when DEBUG=True, so never shown to the user
 *
 * Components use `fieldErrors` to highlight inputs and `message` for toasts.
 * Raw stack traces are never exposed.
 */
export interface ApiError {
  /** HTTP status code, or 0 when the request never reached the server. */
  status: number;
  /** A single, human-readable summary suitable for a toast. */
  message: string;
  /** Per-field DRF errors, e.g. `{ email: ["Enter a valid email address."] }`. */
  fieldErrors: Record<string, string[]>;
  /** Errors that are not attached to a field (`non_field_errors`). */
  nonFieldErrors: string[];
  /** Set when the request failed at the network layer (server down, CORS, DNS). */
  networkError: boolean;
}

const STATUS_FALLBACK: Record<number, string> = {
  0: 'Cannot reach the server. Check that the Django API is running.',
  400: 'Some of the details you entered need attention.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'We could not find what you were looking for.',
  405: 'That action is not supported by the API.',
  409: 'That conflicts with an existing record.',
  500: 'Something went wrong on the server. Please try again.',
  502: 'The server is temporarily unavailable. Please try again.',
  503: 'The server is temporarily unavailable. Please try again.',
  504: 'The server took too long to respond. Please try again.',
};

function normalise(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalise(entry));
  }
  return [];
}

/**
 * Convert anything thrown by HttpClient into a structured `ApiError`.
 * Accepts `HttpErrorResponse` (the normal case) but tolerates arbitrary values
 * so a stray `throw` can never produce an unreadable UI.
 */
export function toApiError(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      status: 0,
      message:
        error instanceof Error && error.message ? error.message : 'An unexpected error occurred.',
      fieldErrors: {},
      nonFieldErrors: [],
      networkError: false,
    };
  }

  const status = error.status;
  const body = error.error as unknown;
  const fieldErrors: Record<string, string[]> = {};
  const nonFieldErrors: string[] = [];
  let message = STATUS_FALLBACK[status] ?? 'Request failed. Please try again.';

  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;

    // { "detail": "..." } — DRF's exception handler shape.
    if (typeof record['detail'] === 'string') {
      message = record['detail'] as string;
    }

    for (const [key, value] of Object.entries(record)) {
      const messages = normalise(value);
      if (messages.length === 0) {
        continue;
      }
      if (key === 'non_field_errors') {
        nonFieldErrors.push(...messages);
      } else if (key !== 'detail') {
        fieldErrors[key] = messages;
      }
    }

    // Prefer the backend's own words over our generic fallback — they are more
    // specific ("Staff member already has a booking during this time.").
    if (nonFieldErrors.length > 0) {
      message = nonFieldErrors[0]!;
    } else if (Object.keys(fieldErrors).length > 0) {
      message = Object.values(fieldErrors)[0]![0] ?? message;
    }
  }

  return {
    status,
    message,
    fieldErrors,
    nonFieldErrors,
    networkError: status === 0,
  };
}

/**
 * Pull just the human-readable message out of an error, for one-line toasts.
 */
export function apiErrorMessage(error: unknown): string {
  return toApiError(error).message;
}
