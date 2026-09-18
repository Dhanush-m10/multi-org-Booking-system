import { ComponentFixture, TestBed } from '@angular/core/testing';

import type {
  Booking,
  BookingPayload,
  Customer,
  Service,
  Staff,
  WorkingHours,
} from '../../core/models/api.models';
import { todayIso } from '../../core/utils/datetime';
import { BookingFormComponent } from './booking-form.component';

/**
 * Covers the two rules the booking flow exists to enforce:
 *  - only staff who perform the chosen service can be selected;
 *  - `end_time` is never an input and never leaves the component.
 *
 * Plus the slot grid, which is the part most likely to drift from the backend.
 */

const services: Service[] = [
  {
    id: 1,
    organization: 1,
    category: 1,
    name: 'Consultation',
    description: '',
    duration_minutes: 30,
    price: '40.00',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    organization: 1,
    category: 1,
    name: 'Retired service',
    description: '',
    duration_minutes: 60,
    price: '10.00',
    is_active: false,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const staff: Staff[] = [
  // performs service 1, active
  {
    id: 1,
    organization: 1,
    name: 'Dana Roy',
    email: 'dana@example.com',
    phone: '',
    specialization: 'GP',
    services: [1],
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  // performs service 1 but is inactive
  {
    id: 2,
    organization: 1,
    name: 'Inactive Ida',
    email: 'ida@example.com',
    phone: '',
    specialization: '',
    services: [1],
    is_active: false,
    created_at: '2026-01-01T00:00:00Z',
  },
  // active, but does NOT perform service 1
  {
    id: 3,
    organization: 1,
    name: 'Other Omar',
    email: 'omar@example.com',
    phone: '',
    specialization: '',
    services: [],
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const customers: Customer[] = [
  {
    id: 1,
    organization: 1,
    name: 'Jane Cooper',
    email: 'jane@example.com',
    phone: '',
    created_at: '2026-01-01T00:00:00Z',
  },
];

/** Monday. Chosen so it is in the future relative to the test suite's "today". */
const MONDAY = '2026-09-21';

const workingHours: WorkingHours[] = [
  {
    id: 1,
    organization: 1,
    staff: 1,
    weekday: 0,
    start_time: '09:00:00',
    end_time: '17:00:00',
    is_available: true,
  },
];

function existingBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 9,
    organization: 1,
    customer: 1,
    service: 1,
    staff: 1,
    booking_date: MONDAY,
    start_time: '09:00:00',
    end_time: '09:30:00',
    status: 'CONFIRMED',
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('BookingFormComponent', () => {
  let fixture: ComponentFixture<BookingFormComponent>;
  let root: HTMLElement;
  /** Protected members are reached through this; the template sees the real ones. */
  let view: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BookingFormComponent] }).compileComponents();

    fixture = TestBed.createComponent(BookingFormComponent);
    fixture.componentRef.setInput('customers', customers);
    fixture.componentRef.setInput('services', services);
    fixture.componentRef.setInput('staff', staff);
    fixture.componentRef.setInput('workingHours', workingHours);
    fixture.componentRef.setInput('bookings', []);
    fixture.detectChanges();

    root = fixture.nativeElement as HTMLElement;
    view = fixture.componentInstance as any;
  });

  it('renders the steps in the required order: service, staff, date, time, customer', () => {
    const ids = Array.from(
      root.querySelectorAll<HTMLElement>(
        '#booking-service, #booking-staff, #booking-date, #booking-customer',
      ),
    ).map((element) => element.id);

    expect(ids).toEqual(['booking-service', 'booking-staff', 'booking-date', 'booking-customer']);

    // The slot grid sits between the date and the customer step.
    const legend = root.querySelector('legend')?.textContent ?? '';
    expect(legend).toContain('Available times');
  });

  it('never exposes an end-time input the user could type into', () => {
    const preview = root.querySelector<HTMLInputElement>('#booking-end-preview');
    expect(preview).not.toBeNull();
    expect(preview!.readOnly).toBe(true);
    expect(preview!.tabIndex).toBe(-1);

    // And the form model has no end_time control at all.
    expect(view.form.controls['end_time']).toBeUndefined();
  });

  it('does not offer a staff member before a service is chosen', () => {
    expect(view.availableStaff()).toEqual([]);
    expect(view.canComputeSlots()).toBe(false);

    const select = root.querySelector<HTMLSelectElement>('#booking-staff');
    expect(select!.disabled).toBe(true);
  });

  it('narrows staff to those who perform the selected service', () => {
    view.onServiceChange('1');
    fixture.detectChanges();

    const offered = view.availableStaff().map((member: Staff) => member.id);
    expect(offered).toEqual([1]); // Dana only — Ida is inactive, Omar cannot do it
    expect(view.availableStaff()[0].name).toBe('Dana Roy');

    const select = root.querySelector<HTMLSelectElement>('#booking-staff');
    expect(select!.disabled).toBe(false);
  });

  it('names inactive-but-capable staff instead of hiding them', () => {
    // The explanation renders when the picker would otherwise be empty, so use
    // a roster where the only person who performs the service is inactive.
    fixture.componentRef.setInput(
      'staff',
      staff.filter((member) => member.id === 2),
    );
    view.onServiceChange('1');
    fixture.detectChanges();

    expect(view.availableStaff()).toEqual([]);
    expect(view.inactiveCapableStaff().map((member: Staff) => member.name)).toEqual([
      'Inactive Ida',
    ]);
    expect(root.textContent).toContain('Inactive Ida');
    expect(root.textContent).toContain('inactive');
  });

  it('excludes inactive services from the picker', () => {
    expect(view.bookableServices().map((service: Service) => service.id)).toEqual([1]);
  });

  it('clears the staff selection when the service changes', () => {
    view.onServiceChange('1');
    view.onStaffChange('1');
    expect(view.form.controls.staff.value).toBe(1);

    view.onServiceChange('2'); // a service nobody performs
    fixture.detectChanges();

    expect(view.form.controls.staff.value).toBeNull();
    expect(view.selectedStaffId()).toBeNull();
  });

  it('computes slots from working hours, duration and existing bookings', () => {
    fixture.componentRef.setInput('bookings', [existingBooking()]);
    view.onServiceChange('1');
    view.onStaffChange('1');
    view.onDateChange(MONDAY);
    fixture.detectChanges();

    const starts = view.slots().map((slot: { start: string }) => slot.start);
    expect(starts).toContain('09:30');
    expect(starts).toContain('16:30'); // last start that still fits before 17:00
    expect(starts).not.toContain('16:45');
    expect(starts).not.toContain('08:45');

    // 09:00-09:30 is taken; 09:30 merely touches it and stays free.
    expect(view.slots().find((s: any) => s.start === '09:00').available).toBe(false);
    expect(view.slots().find((s: any) => s.start === '09:30').available).toBe(true);
  });

  it('disables booked slots in the DOM', () => {
    fixture.componentRef.setInput('bookings', [existingBooking()]);
    view.onServiceChange('1');
    view.onStaffChange('1');
    view.onDateChange(MONDAY);
    fixture.detectChanges();

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
    const nineAm = buttons.find((button) => button.textContent?.trim().startsWith('09:00'));
    expect(nineAm?.disabled).toBe(true);
  });

  it('explains itself when no hours exist for the chosen day', () => {
    view.onServiceChange('1');
    view.onStaffChange('1');
    view.onDateChange('2026-09-22'); // Tuesday — no hours seeded
    fixture.detectChanges();

    expect(view.slots()).toEqual([]);
    expect(root.textContent).toContain('no working hours');
  });

  it('clears the chosen time when the staff member changes', () => {
    view.onServiceChange('1');
    view.onStaffChange('1');
    view.onDateChange(MONDAY);
    view.chooseSlot('10:00');
    expect(view.form.controls.start_time.value).toBe('10:00');

    view.onStaffChange('3');
    fixture.detectChanges();

    expect(view.selectedSlot()).toBe('');
    expect(view.form.controls.start_time.value).toBe('');
  });

  it('previews the end time as start + duration', () => {
    view.onServiceChange('1'); // 30 minutes
    view.chooseSlot('10:00');
    fixture.detectChanges();

    expect(view.projectedEnd()).toBe('10:30');
    const preview = root.querySelector<HTMLInputElement>('#booking-end-preview');
    expect(preview!.value).toBe('10:30');
  });

  it('emits a payload with HH:MM:SS start_time, status PENDING and no end_time', () => {
    const payloads: BookingPayload[] = [];
    fixture.componentInstance.submitted.subscribe((payload) => payloads.push(payload));

    view.onServiceChange('1');
    view.onStaffChange('1');
    view.onDateChange(MONDAY);
    view.chooseSlot('10:00');
    view.form.controls.customer.setValue(1);
    view.form.controls.notes.setValue('First visit');
    fixture.detectChanges();

    view.onSubmit();

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      customer: 1,
      service: 1,
      staff: 1,
      booking_date: MONDAY,
      start_time: '10:00:00',
      status: 'PENDING',
      notes: 'First visit',
    });
    expect(payloads[0]).not.toHaveProperty('end_time');
  });

  it('does not submit while the form is incomplete', () => {
    const payloads: BookingPayload[] = [];
    fixture.componentInstance.submitted.subscribe((payload) => payloads.push(payload));

    view.onServiceChange('1');
    view.onStaffChange('1');
    // no slot chosen, no customer
    view.onSubmit();

    expect(payloads).toHaveLength(0);
    expect(view.form.controls.start_time.touched).toBe(true);
  });

  it('surfaces a backend field error above its own validation message', () => {
    fixture.componentRef.setInput('fieldErrors', { customer: 'Customer does not exist.' });
    fixture.detectChanges();

    expect(view.fieldError('customer')).toBe('Customer does not exist.');
  });

  it('surfaces non_field_errors, e.g. the overlap message', () => {
    fixture.componentRef.setInput('fieldErrors', {
      non_field_errors: 'Staff member already has a booking during this time.',
    });
    fixture.detectChanges();

    expect(view.nonFieldError()).toContain('already has a booking');
  });

  it("does not offer today's slots that have already passed", () => {
    const now = new Date();
    // Only meaningful once the day is far enough along to have passed 09:00.
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    if (minutesNow < 9 * 60 + 30) {
      return;
    }

    fixture.componentRef.setInput('workingHours', [
      { ...workingHours[0], weekday: (now.getDay() + 6) % 7 },
    ]);
    view.onServiceChange('1');
    view.onStaffChange('1');
    view.onDateChange(todayIso());
    fixture.detectChanges();

    for (const slot of view.slots()) {
      const [h, m] = slot.start.split(':').map(Number);
      expect(h * 60 + m).toBeGreaterThanOrEqual(minutesNow);
    }
  });
});
