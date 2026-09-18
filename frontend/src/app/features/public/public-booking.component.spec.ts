import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { PublicBookingComponent } from './public-booking.component';

/**
 * The customer portal is deliberately inert: the backend cannot resolve an
 * organization by slug, exposes no public read access, has no customer
 * authentication and requires IsOrganizationStaff to book. So these tests are
 * mostly about what the screen must NOT contain.
 */
describe('PublicBookingComponent', () => {
  let fixture: ComponentFixture<PublicBookingComponent>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicBookingComponent, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicBookingComponent);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('echoes the requested organization slug', () => {
    fixture.componentRef.setInput('organizationSlug', 'abc-clinic');
    fixture.detectChanges();

    expect(text()).toContain('abc-clinic');
  });

  it('echoes the requested step', () => {
    fixture.componentRef.setInput('organizationSlug', 'abc-clinic');
    fixture.componentRef.setInput('step', 'date');
    fixture.detectChanges();

    expect(text()).toContain('date');
  });

  it('states plainly that booking is not available', () => {
    expect(text()).toContain('Online booking is not available yet');
  });

  it('marks the planned steps as non-interactive', () => {
    const items = Array.from(root.querySelectorAll<HTMLElement>('ol li'));
    expect(items.length).toBe(6); // service, staff, date, time, details, confirmation
    for (const item of items) {
      expect(item.getAttribute('aria-disabled')).toBe('true');
    }
    expect(root.querySelectorAll('ol li button, ol li a').length).toBe(0);
  });

  it('names every backend capability it is waiting on', () => {
    const body = text();
    expect(body).toContain('public organization endpoint');
    expect(body).toContain('Unauthenticated read access');
    expect(body).toContain('customer identity');
    expect(body).toContain('booking permission for customers');
  });

  it('contains no mock booking data', () => {
    const body = text();

    // No invented services, staff, customers or prices.
    expect(body).not.toMatch(/\$\d/);
    expect(body).not.toMatch(/\b\d{1,2}:\d{2}\b/); // no sample times
    expect(body).not.toMatch(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)day\b/); // no sample dates
    for (const name of ['Dana', 'Jane', 'Priya', 'Consultation', 'Haircut']) {
      expect(body).not.toContain(name);
    }
  });

  it('never asks the visitor for an organization id', () => {
    // The slug comes from the URL only; there is no form to type one into.
    expect(root.querySelectorAll('input, select, textarea').length).toBe(0);
  });

  it('never displays management chrome', () => {
    const body = text();
    expect(root.querySelector('app-sidebar')).toBeNull();
    expect(root.querySelector('app-topbar')).toBeNull();
    for (const label of ['Dashboard', 'Availability management', 'Customer management']) {
      expect(body).not.toContain(label);
    }
  });

  it('offers staff a way into the workspace', () => {
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a')).map(
      (link) => link.getAttribute('href') ?? '',
    );
    expect(links).toContain('/login');
    expect(links).toContain('/register');
  });
});
