import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { PublicBookingComponent } from './public-booking.component';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { TokenService } from '../../core/services/token.service';

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

const SLUG = 'acme-clinic';
const BASE = `/api/public/organizations/${SLUG}`;

const ORG = {
  slug: SLUG,
  name: 'Acme Clinic',
  email: 'hello@acme.test',
  phone: '0000000000',
  address: '1 Test Street',
};

const SERVICES = [
  {
    id: 1,
    name: 'Consultation',
    description: 'A first appointment',
    duration_minutes: 30,
    price: '40.00',
    category: { id: 1, name: 'General' },
  },
  {
    id: 2,
    name: 'Deep clean',
    description: '',
    duration_minutes: 60,
    price: '95.00',
    category: { id: 2, name: 'Dental' },
  },
];

const STAFF = [
  { id: 1, name: 'Dana Roy', specialization: 'Hygienist', service_ids: [1] },
  { id: 2, name: 'Ben Lee', specialization: 'Surgeon', service_ids: [1, 2] },
  { id: 3, name: 'Sam Fox', specialization: 'Ortho', service_ids: [2] },
];

/**
 * The customer booking wizard.
 *
 * These tests assert the properties that matter for the customer portal:
 * everything on screen comes from the API, the organization slug in the URL is
 * the only organization selector, and the booking request carries no identity
 * fields for the backend to have to second-guess.
 */
describe('PublicBookingComponent', () => {
  let fixture: ComponentFixture<PublicBookingComponent>;
  let backend: HttpTestingController;
  let router: Router;
  let tokens: TokenService;

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';

  /** Flush the three parallel catalogue requests a forkJoin issues. */
  function flushCatalogue(): void {
    backend.expectOne(`${BASE}/`).flush(ORG);
    backend.expectOne(`${BASE}/services/`).flush(SERVICES);
    backend.expectOne(`${BASE}/staff/`).flush(STAFF);
    fixture.detectChanges();
  }

  async function create(opts: { slug?: string; step?: string } = {}): Promise<void> {
    fixture = TestBed.createComponent(PublicBookingComponent);
    if (opts.slug !== undefined) {
      fixture.componentRef.setInput('organizationSlug', opts.slug);
    } else {
      fixture.componentRef.setInput('organizationSlug', SLUG);
    }
    if (opts.step) {
      fixture.componentRef.setInput('step', opts.step);
    }
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [PublicBookingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'book/:organizationSlug/:step', component: TestPageComponent },
          { path: 'book/:organizationSlug/register', component: TestPageComponent },
          { path: 'customer/bookings', component: TestPageComponent },
          { path: 'login', component: TestPageComponent },
        ]),
      ],
    }).compileComponents();

    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    tokens = TestBed.inject(TokenService);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('renders nothing invented while the catalogue is still loading', async () => {
    await create();

    // Before the API answers, the DOM must not contain any service name, staff
    // name or time of day. Everything shown later has to come from the response.
    const html = text();
    expect(html).not.toContain('Consultation');
    expect(html).not.toContain('Dana Roy');
    expect(html).not.toMatch(/\d{1,2}:\d{2}/);

    flushCatalogue();
  });

  it('shows the organization resolved from the slug in the URL', async () => {
    await create();
    flushCatalogue();

    expect(text()).toContain('Acme Clinic');
  });

  it('asks for the organization slug it was given and no other identifier', async () => {
    await create();
    flushCatalogue();

    // Every request went to the slug-based public path. Nothing carried an
    // organization id, and nothing asked the visitor for one.
    for (const url of [`${BASE}/`, `${BASE}/services/`, `${BASE}/staff/`]) {
      expect(url).toContain(SLUG);
      expect(url).not.toMatch(/organization=\d/);
    }
  });

  it('lists exactly the services the API returned', async () => {
    await create();
    flushCatalogue();

    const names = Array.from(root().querySelectorAll('ul li button span span'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean);

    expect(names).toContain('Consultation');
    expect(names).toContain('Deep clean');
    expect(root().querySelectorAll('ul > li').length).toBe(SERVICES.length);
  });

  it('says so plainly when the organization has published no services', async () => {
    await create();
    backend.expectOne(`${BASE}/`).flush(ORG);
    backend.expectOne(`${BASE}/services/`).flush([]);
    backend.expectOne(`${BASE}/staff/`).flush([]);
    fixture.detectChanges();

    expect(text()).toContain('No services are available yet');
  });

  it('treats an unknown slug as an unknown business, not an error', async () => {
    await create({ slug: 'no-such-business' });

    // forkJoin unsubscribes from its siblings the instant one source errors, so
    // only the first response can be flushed; the other two are cancelled and
    // must not be flushed. verify() ignores cancelled requests.
    backend
      .expectOne('/api/public/organizations/no-such-business/')
      .flush({ detail: 'Not found.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(text()).toContain('We could not find that business');

    const cancelled = backend.match(() => true).filter((request) => request.cancelled);
    expect(cancelled.length).toBe(2);
  });

  it('offers a retry when the catalogue request fails', async () => {
    await create();

    // Same forkJoin short-circuit: one failure is enough, the rest are cancelled.
    backend.expectOne(`${BASE}/`).flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    // Tearing the sibling subscriptions down is not synchronous, so without this
    // afterEach's verify() would still see them as open.
    await fixture.whenStable();

    // The two siblings were cancelled, but the testing backend still lists
    // cancelled requests as open, so drain them explicitly.
    const cancelled = backend.match(() => true).filter((request) => request.cancelled);
    expect(cancelled.length).toBe(2);

    expect(text()).toContain('We could not load this page');
    expect(root().querySelector('button')?.textContent).toContain('Try again');
  });

  it('shows the organization public profile on the landing step', async () => {
    await create();
    flushCatalogue();

    const html = text();
    expect(html).toContain('Acme Clinic');
    expect(html).toContain('1 Test Street');
    expect(html).toContain('0000000000');

    // Contact details are links a visitor can actually use.
    const hrefs = Array.from(root().querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('tel:0000000000');
    expect(hrefs).toContain('mailto:hello@acme.test');
  });

  it('exposes no internal identifier in the organization block', async () => {
    await create();
    flushCatalogue();

    const section = root().querySelector('section[aria-labelledby="organization-name"]');
    expect(section).not.toBeNull();
    // The public serializer has no id field; the slug is the public handle and
    // even that is only in the URL, not rendered as data.
    expect(section?.textContent).not.toContain('"id"');
    expect(section?.textContent?.trim()).not.toContain(ORG.slug);
  });

  it('refetches slots when returning to the date step instead of claiming none are left', async () => {
    // Simulate a visitor who already picked a time and pressed Back from the
    // confirmation screen. The slot list is derived data and is not part of the
    // draft, so it must be requested again rather than reported as empty.
    const draft = TestBed.inject(BookingDraftService);
    draft.begin(SLUG);
    draft.service.set(SERVICES[0]);
    draft.staff.set(STAFF[0]);
    draft.date.set('2030-01-07');
    draft.startTime.set('09:30:00');

    await create({ step: 'date' });
    flushCatalogue();

    backend
      .expectOne((req) => req.url === `${BASE}/availability/slots/`)
      .flush({
        service: 1,
        staff: 1,
        date: '2030-01-07',
        duration_minutes: 30,
        working_hours: { staff: 1, weekday: 0, start_time: '09:00:00', end_time: '17:00:00' },
        slots: [
          { start: '09:00:00', end: '09:30:00', available: true, reason: null },
          { start: '09:30:00', end: '10:00:00', available: true, reason: null },
        ],
      });
    fixture.detectChanges();

    expect(text()).not.toContain('No times left on that day');

    const buttons = Array.from(root().querySelectorAll('ul li button'));
    const chosen = buttons[1] as HTMLButtonElement;
    const other = buttons[0] as HTMLButtonElement;

    // Selected state is conveyed in the accessibility tree as well as visually,
    // never by colour alone.
    expect(chosen.getAttribute('aria-current')).toBe('true');
    expect(chosen.getAttribute('aria-label')).toContain('currently selected');
    expect(other.getAttribute('aria-current')).toBeNull();
  });

  it('never renders a customer or organization picker', async () => {
    await create();
    flushCatalogue();

    // The visitor chooses a service, a person and a time. Identity is not
    // theirs to supply, so there must be no control that could suggest it is.
    const selects = root().querySelectorAll('select');
    expect(selects.length).toBe(0);

    const labels = Array.from(root().querySelectorAll('label')).map(
      (node) => node.textContent?.toLowerCase() ?? '',
    );
    expect(labels.join(' ')).not.toContain('customer');
    expect(labels.join(' ')).not.toContain('organization');
  });

  it('shows no management navigation', async () => {
    await create();
    flushCatalogue();

    const html = text().toLowerCase();
    for (const forbidden of ['dashboard', 'customers', 'availability', 'sign out']) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("links to sign in and to this organization's own registration page", async () => {
    await create();
    flushCatalogue();

    const hrefs = Array.from(root().querySelectorAll('a')).map(
      (link) => link.getAttribute('href') ?? '',
    );

    expect(hrefs.some((href) => href.startsWith('/login'))).toBe(true);
    // Registration is scoped to the organization in the URL, so a visitor can
    // never be offered a choice of organization to join.
    expect(hrefs.some((href) => href.startsWith(`/book/${SLUG}/register`))).toBe(true);
  });

  it('posts a booking with no customer and no organization field', async () => {
    tokens.setUser({
      id: 9,
      username: 'jane@example.test',
      email: 'jane@example.test',
      role: 'CUSTOMER',
      organizationName: 'Acme Clinic',
      organizationSlug: SLUG,
    });
    tokens.setTokens('access', 'refresh');

    await create({ step: 'confirmation' });
    flushCatalogue();

    // Drive the draft the same way the earlier steps would have.
    const component = fixture.componentInstance as unknown as {
      draft: {
        service: { set: (value: unknown) => void };
        staff: { set: (value: unknown) => void };
        date: { set: (value: string) => void };
        startTime: { set: (value: string) => void };
        endTime: { set: (value: string) => void };
      };
      confirm: () => void;
    };
    component.draft.service.set(SERVICES[0]);
    component.draft.staff.set(STAFF[0]);
    component.draft.date.set('2030-01-07');
    component.draft.startTime.set('10:00:00');
    component.draft.endTime.set('10:30:00');
    fixture.detectChanges();

    component.confirm();
    fixture.detectChanges();

    const request = backend.expectOne('/api/customer/bookings/');
    expect(request.request.method).toBe('POST');

    // The security-relevant assertion: the body carries only what a customer is
    // allowed to choose. Both identity fields are absent, not merely ignored.
    expect(request.request.body).toEqual({
      service: 1,
      staff: 1,
      booking_date: '2030-01-07',
      start_time: '10:00:00',
      notes: '',
    });
    expect(request.request.body as Record<string, unknown>).not.toHaveProperty('customer');
    expect(request.request.body as Record<string, unknown>).not.toHaveProperty('organization');
    expect(request.request.body as Record<string, unknown>).not.toHaveProperty('status');

    request.flush({
      id: 55,
      organization: 1,
      customer: 9,
      service: 1,
      staff: 1,
      booking_date: '2030-01-07',
      start_time: '10:00:00',
      end_time: '10:30:00',
      status: 'PENDING',
      notes: '',
      created_at: '2030-01-01T00:00:00Z',
      updated_at: '2030-01-01T00:00:00Z',
    });
    fixture.detectChanges();

    expect(text()).toContain('Booking request received');
  });

  it('sends an anonymous visitor to sign in instead of booking', async () => {
    await create({ step: 'confirmation' });
    flushCatalogue();

    const component = fixture.componentInstance as unknown as { confirm: () => void };
    component.confirm();
    fixture.detectChanges();
    await fixture.whenStable();

    // No booking request was made at all.
    backend.expectNone('/api/customer/bookings/');
    expect(router.url).toContain('/login');
  });

  it('renders the slots the server returned, marking taken ones unavailable', async () => {
    await create({ step: 'date' });
    flushCatalogue();

    const component = fixture.componentInstance as unknown as {
      draft: {
        service: { set: (value: unknown) => void };
        staff: { set: (value: unknown) => void };
      };
      onDateChange: (value: string) => void;
    };
    component.draft.service.set(SERVICES[0]);
    component.draft.staff.set(STAFF[0]);
    fixture.detectChanges();

    component.onDateChange('2030-01-07');
    fixture.detectChanges();

    const request = backend.expectOne(
      (req) => req.url === `${BASE}/availability/slots/` && req.method === 'GET',
    );
    expect(request.request.params.get('service')).toBe('1');
    expect(request.request.params.get('staff')).toBe('1');
    expect(request.request.params.get('date')).toBe('2030-01-07');

    request.flush({
      service: 1,
      staff: 1,
      date: '2030-01-07',
      duration_minutes: 30,
      working_hours: { staff: 1, weekday: 0, start_time: '09:00:00', end_time: '17:00:00' },
      slots: [
        { start: '09:00:00', end: '09:30:00', available: true, reason: null },
        { start: '09:30:00', end: '10:00:00', available: false, reason: 'booked' },
      ],
    });
    fixture.detectChanges();

    const buttons = Array.from(root().querySelectorAll('ul li button'));
    expect(buttons.length).toBe(2);

    const free = buttons[0] as HTMLButtonElement;
    const taken = buttons[1] as HTMLButtonElement;

    expect(free.disabled).toBe(false);
    expect(taken.disabled).toBe(true);
    // Unavailable is conveyed in words, not by colour or a disabled style alone.
    expect(taken.getAttribute('aria-label')).toContain('already booked');
  });

  it('says the staff member does not work that day rather than inventing times', async () => {
    await create({ step: 'date' });
    flushCatalogue();

    const component = fixture.componentInstance as unknown as {
      draft: {
        service: { set: (value: unknown) => void };
        staff: { set: (value: unknown) => void };
      };
      onDateChange: (value: string) => void;
    };
    component.draft.service.set(SERVICES[0]);
    component.draft.staff.set(STAFF[0]);
    fixture.detectChanges();

    component.onDateChange('2030-01-08');
    fixture.detectChanges();

    backend
      .expectOne((req) => req.url === `${BASE}/availability/slots/`)
      .flush({
        service: 1,
        staff: 1,
        date: '2030-01-08',
        duration_minutes: 30,
        working_hours: null,
        slots: [],
      });
    fixture.detectChanges();

    expect(text()).toContain('Not working on that day');
  });
});
