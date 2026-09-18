import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import { CapabilitiesService } from './capabilities.service';

/**
 * The role is inferred from a real HTTP status, so every branch matters:
 *  - 200  -> may manage the catalogue (ADMIN)
 *  - 403  -> may not (STAFF)
 *  - anything else -> stays UNKNOWN, never a guess
 *
 * A wrong guess here hides admin screens from an admin or shows a STAFF member
 * three screens that can only 403.
 */
describe('CapabilitiesService', () => {
  let service: CapabilitiesService;
  let backend: HttpTestingController;
  const url = `${environment.apiBaseUrl}/services/`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CapabilitiesService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
  });

  it('starts unknown rather than assuming a role', () => {
    expect(service.canManageCatalogue()).toBeNull();
    expect(service.resolved()).toBe(false);
  });

  it('treats 200 as permission to manage the catalogue', () => {
    service.probe();
    backend.expectOne(url).flush([], { status: 200, statusText: 'OK' });

    expect(service.canManageCatalogue()).toBe(true);
    expect(service.resolved()).toBe(true);
  });

  it('treats 403 as a STAFF member', () => {
    service.probe();
    backend.expectOne(url).flush({ detail: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    expect(service.canManageCatalogue()).toBe(false);
    expect(service.resolved()).toBe(true);
  });

  it('stays unknown on a server error instead of guessing', () => {
    service.probe();
    backend.expectOne(url).flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });

    // A 500 says nothing about the user's role. Claiming "STAFF" here would
    // silently strip admin navigation from an administrator.
    expect(service.canManageCatalogue()).toBeNull();
    expect(service.resolved()).toBe(false);
  });

  it('stays unknown on a network failure', () => {
    service.probe();
    backend.expectOne(url).error(new ProgressEvent('offline'));

    expect(service.canManageCatalogue()).toBeNull();
    expect(service.resolved()).toBe(false);
  });

  it('probes only once, however often it is asked', () => {
    service.probe();
    service.probe();
    service.probe();

    // A single request; the duplicates were suppressed while in flight.
    backend.expectOne(url).flush([], { status: 200, statusText: 'OK' });

    service.probe(); // already resolved — still nothing new
    backend.expectNone(url);
  });

  it('marks the probe request silent so a 403 raises no toast', () => {
    service.probe();
    const request = backend.expectOne(url);

    expect(request.request.headers.get('X-Silent-Error')).toBe('1');
    request.flush([], { status: 200, statusText: 'OK' });
  });

  it('clears on logout so the next user is probed afresh', () => {
    service.probe();
    backend.expectOne(url).flush([], { status: 200, statusText: 'OK' });
    expect(service.canManageCatalogue()).toBe(true);

    service.reset();
    expect(service.canManageCatalogue()).toBeNull();
    expect(service.resolved()).toBe(false);

    // A second user in the same browser session gets a fresh probe.
    service.probe();
    backend.expectOne(url).flush({ detail: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    expect(service.canManageCatalogue()).toBe(false);
  });
});
