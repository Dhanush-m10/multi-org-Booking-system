import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { BookingsPageComponent } from './bookings-page.component';

/**
 * The bookings page loads five collections at once. Bookings and customers are
 * readable by any organization member, but services, staff and working-hours
 * are IsOrganizationAdmin — so a STAFF member gets 403 on three of them.
 *
 * Inside `forkJoin` a single error used to sink the whole screen, which meant a
 * STAFF member saw a hard error on a page they are entitled to use. These tests
 * pin the degradation instead.
 */
describe('BookingsPageComponent', () => {
  let fixture: ComponentFixture<BookingsPageComponent>;
  let root: HTMLElement;
  let backend: HttpTestingController;
  let view: any;

  const booking = {
    id: 1,
    organization: 1,
    customer: 1,
    service: 1,
    staff: 1,
    booking_date: '2026-09-21',
    start_time: '10:00:00',
    end_time: '10:30:00',
    status: 'CONFIRMED',
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingsPageComponent);
    root = fixture.nativeElement as HTMLElement;
    view = fixture.componentInstance as any;
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
  });

  /** Answer the five parallel requests, optionally refusing the admin-only ones. */
  function respond(options: { refuseAdminOnly?: boolean } = {}): void {
    const refuse = options.refuseAdminOnly ?? false;
    const expected: Record<string, object[]> = {
      bookings: [booking],
      customers: [{ id: 1, organization: 1, name: 'Jane Cooper', email: '', phone: '' }],
      services: [{ id: 1, organization: 1, name: 'Consultation', is_active: true }],
      staff: [{ id: 1, organization: 1, name: 'Dana Roy', services: [1], is_active: true }],
      'working-hours': [
        {
          id: 1,
          organization: 1,
          staff: 1,
          weekday: 0,
          start_time: '09:00:00',
          end_time: '17:00:00',
          is_available: true,
        },
      ],
    };

    for (const [path, body] of Object.entries(expected)) {
      const adminOnly = ['services', 'staff', 'working-hours'].includes(path);
      const request = backend.expectOne(`${environment.apiBaseUrl}/${path}/`);

      if (refuse && adminOnly) {
        request.flush({ detail: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
      } else {
        request.flush(body);
      }
    }
  }

  it('renders normally when every lookup succeeds', () => {
    fixture.detectChanges();
    respond();
    fixture.detectChanges();

    expect(view.loading()).toBe(false);
    expect(view.degraded()).toBe(false);
    expect(view.bookings()).toHaveLength(1);
    expect(root.textContent).not.toContain('Limited view');
  });

  it('still shows bookings when the admin-only lookups are refused', () => {
    fixture.detectChanges();
    respond({ refuseAdminOnly: true });
    fixture.detectChanges();

    // The page the STAFF member is entitled to must not error out.
    expect(view.error()).toBeNull();
    expect(view.loading()).toBe(false);
    expect(view.bookings()).toHaveLength(1);
    expect(view.customers()).toHaveLength(1);

    // The refused lookups degrade to empty lists.
    expect(view.services()).toEqual([]);
    expect(view.staff()).toEqual([]);
    expect(view.workingHours()).toEqual([]);

    expect(view.degraded()).toBe(true);
    expect(root.textContent).toContain('Limited view');
  });

  it('explains why the create button disappears when degraded', () => {
    fixture.detectChanges();
    respond({ refuseAdminOnly: true });
    fixture.detectChanges();

    expect(root.textContent).toContain('not an organization admin');
  });

  it('surfaces a genuine failure on bookings as an error state, not a degraded view', () => {
    fixture.detectChanges();

    // Bookings is readable by any member, so a failure here is a real error.
    backend
      .expectOne(`${environment.apiBaseUrl}/bookings/`)
      .flush({ detail: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

    // `forkJoin` unsubscribes from its siblings the moment one source errors, so
    // whichever of the other four are still in flight get cancelled. `match()`
    // returns those too, so filter to the ones genuinely awaiting a response.
    for (const request of backend.match(() => true)) {
      if (!request.cancelled) {
        request.flush([]);
      }
    }
    fixture.detectChanges();

    expect(view.error()).toBeTruthy();
    expect(view.degraded()).toBe(false);
    expect(root.querySelector('[role="alert"], app-error-state')).not.toBeNull();
  });
});
