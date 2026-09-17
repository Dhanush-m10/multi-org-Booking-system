import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import { apiErrorMessage, toApiError } from './api-errors';

/**
 * Every user-facing message in the app comes out of `toApiError`, so these
 * cases are the actual shapes Django returns (captured from the live API).
 */
describe('toApiError', () => {
  function errorResponse(status: number, body: unknown): HttpErrorResponse {
    return new HttpErrorResponse({
      status,
      statusText: 'Error',
      url: 'http://localhost/api/bookings/',
      headers: new HttpHeaders(),
      error: body,
    });
  }

  it('surfaces non_field_errors, which is how BookingSerializer reports conflicts', () => {
    const result = toApiError(
      errorResponse(400, {
        non_field_errors: ['Staff member already has a booking during this time.'],
      }),
    );

    expect(result.status).toBe(400);
    expect(result.message).toBe('Staff member already has a booking during this time.');
    expect(result.nonFieldErrors).toEqual(['Staff member already has a booking during this time.']);
  });

  it('maps per-field DRF errors so forms can highlight the input', () => {
    const result = toApiError(
      errorResponse(400, {
        name: ['This field may not be blank.'],
        email: ['This field is required.'],
      }),
    );

    expect(result.fieldErrors).toEqual({
      name: ['This field may not be blank.'],
      email: ['This field is required.'],
    });
    expect(result.message).toBe('This field may not be blank.');
  });

  it('uses the backend `detail` string for auth failures', () => {
    const result = toApiError(
      errorResponse(401, {
        detail: 'No active account found with the given credentials',
      }),
    );

    expect(result.message).toBe('No active account found with the given credentials');
  });

  it('never exposes Django debug HTML for a 500', () => {
    const result = toApiError(
      new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
        error: '<html><body>Traceback...</body></html>',
      }),
    );

    expect(result.message).toBe('Something went wrong on the server. Please try again.');
    expect(result.message).not.toContain('Traceback');
  });

  it('flags network failures distinctly', () => {
    const result = toApiError(new HttpErrorResponse({ status: 0, error: null }));

    expect(result.networkError).toBe(true);
    expect(result.message).toContain('Cannot reach the server');
  });

  it('reports the unique constraint the way the availability screen expects', () => {
    const result = apiErrorMessage(
      errorResponse(400, {
        non_field_errors: ['The fields staff, weekday must make a unique set.'],
      }),
    );

    expect(result).toContain('unique set');
  });

  it('tolerates a non-HTTP thrown value', () => {
    const result = toApiError(new Error('boom'));

    expect(result.status).toBe(0);
    expect(result.message).toBe('boom');
  });
});
