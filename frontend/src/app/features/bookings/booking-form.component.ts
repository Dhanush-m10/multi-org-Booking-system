import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import type {
  Booking,
  BookingPayload,
  Customer,
  Service,
  Staff,
  WorkingHours,
} from '../../core/models/api.models';
import {
  addMinutesToTime,
  formatDate,
  formatDuration,
  formatPrice,
  isoToWeekday,
  timeToMinutes,
  todayIso,
  WEEKDAY_LABELS,
} from '../../core/utils/datetime';
import { computeTimeSlots, countAvailable } from '../../core/utils/slots';
import { ButtonComponent } from '../../shared/components/button.component';
import { FieldComponent } from '../../shared/components/field.component';
import { IconComponent } from '../../shared/components/icon.component';

/**
 * Create-booking form.
 *
 * THE FLOW
 * --------
 * Service -> compatible staff -> date -> available time -> customer -> confirm.
 * Each step only becomes meaningful once the one above it is settled, which is
 * the order the dependencies actually run in:
 *
 *   service   decides who can perform it and how long it takes
 *   staff     decides whose diary and whose working hours apply
 *   date      decides the weekday, and therefore which working hours apply
 *   time      is derived from the three above
 *   customer  is independent, so it comes last
 *
 * `end_time` is never an input and never sent. The backend derives it from
 * `service.duration_minutes`; this form only previews the value.
 *
 * WHAT IS AND IS NOT ENFORCED HERE
 * --------------------------------
 * The staff filter and the slot grid reproduce the backend's rules so the user
 * is not offered something that will be rejected. They are conveniences, not
 * guarantees: the server re-validates on submit (overlap, working hours, past
 * dates, staff-service assignment, organization membership) and its message is
 * surfaced verbatim through `fieldErrors` / `nonFieldError`.
 */
@Component({
  selector: 'app-booking-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, FieldComponent, IconComponent],
  templateUrl: './booking-form.component.html',
})
export class BookingFormComponent {
  private readonly fb = inject(FormBuilder);

  /** All customers / services / staff for the current organization. */
  readonly customers = input.required<Customer[]>();
  readonly services = input.required<Service[]>();
  readonly staff = input.required<Staff[]>();
  /** Needed to show which slots are already taken. */
  readonly bookings = input<Booking[]>([]);
  /** Needed to know when the chosen staff member actually works. */
  readonly workingHours = input<WorkingHours[]>([]);

  readonly saving = input(false);
  readonly formError = input('');
  readonly fieldErrors = input<Record<string, string>>({});

  readonly submitted = output<BookingPayload>();
  readonly cancelled = output<void>();

  protected readonly today = todayIso();
  protected readonly weekdayLabels = WEEKDAY_LABELS;

  /**
   * Signal mirrors of the fields that drive dependent UI. Reactive-form values
   * are not signals, so a `computed()` over `control.value` would never
   * re-evaluate under zoneless change detection; the `(change)` handlers below
   * keep these in sync.
   */
  protected readonly selectedServiceId = signal<number | null>(null);
  protected readonly selectedStaffId = signal<number | null>(null);
  protected readonly selectedDate = signal<string>(todayIso());
  protected readonly selectedSlot = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    service: [null as number | null, [Validators.required]],
    // Starts disabled: there is no service yet, so there is nobody to pick.
    staff: [{ value: null as number | null, disabled: true }, [Validators.required]],
    booking_date: [todayIso(), [Validators.required]],
    start_time: ['', [Validators.required]],
    customer: [null as number | null, [Validators.required]],
    notes: [''],
  });

  /* --------------------------- step 1: service ---------------------------- */

  /** Active services only — an inactive service should not be bookable. */
  protected readonly bookableServices = computed(() =>
    this.services().filter((service) => service.is_active),
  );

  protected readonly selectedService = computed(
    () => this.services().find((service) => service.id === this.selectedServiceId()) ?? null,
  );

  /* ---------------------- step 2: staff who can do it ---------------------- */

  /**
   * Staff who can perform the selected service. Empty until a service is
   * chosen, so the picker never offers someone the backend would reject.
   */
  protected readonly availableStaff = computed(() => {
    const serviceId = this.selectedServiceId();
    if (serviceId === null) {
      return [];
    }
    return this.staff().filter((member) => member.is_active && member.services.includes(serviceId));
  });

  /**
   * Capable but inactive staff, named rather than silently hidden, so an empty
   * picker explains itself.
   */
  protected readonly inactiveCapableStaff = computed(() => {
    const serviceId = this.selectedServiceId();
    if (serviceId === null) {
      return [];
    }
    return this.staff().filter(
      (member) => !member.is_active && member.services.includes(serviceId),
    );
  });

  protected readonly selectedStaff = computed(
    () => this.staff().find((member) => member.id === this.selectedStaffId()) ?? null,
  );

  /* --------------------- steps 3-4: date and time slot --------------------- */

  protected readonly selectedWeekdayLabel = computed(() => {
    const weekday = isoToWeekday(this.selectedDate());
    return weekday === null ? null : this.weekdayLabels[weekday];
  });

  /** The chosen staff member's hours for the chosen weekday. */
  protected readonly workingHoursForSelection = computed(() => {
    const staffId = this.selectedStaffId();
    const weekday = isoToWeekday(this.selectedDate());
    if (staffId === null || weekday === null) {
      return null;
    }
    return (
      this.workingHours().find((row) => row.staff === staffId && row.weekday === weekday) ?? null
    );
  });

  /**
   * Bookable slots, computed with the backend's own arithmetic. On today's date
   * slots that have already passed are dropped.
   */
  protected readonly slots = computed(() => {
    const service = this.selectedService();
    const staffId = this.selectedStaffId();
    if (!service || staffId === null) {
      return [];
    }

    const date = this.selectedDate();
    const isToday = date === this.today;

    return computeTimeSlots({
      workingHours: this.workingHoursForSelection(),
      durationMinutes: service.duration_minutes,
      date,
      bookings: this.bookings(),
      staffId,
      notBeforeMinutes: isToday ? this.minutesSinceMidnight() : null,
    });
  });

  protected readonly openSlots = computed(() => countAvailable(this.slots()));

  /** True once every input to the slot grid is settled. */
  protected readonly canComputeSlots = computed(
    () => this.selectedService() !== null && this.selectedStaffId() !== null,
  );

  protected readonly projectedEnd = computed(() => {
    const duration = this.selectedService()?.duration_minutes;
    if (!duration || !this.selectedSlot()) {
      return null;
    }
    return addMinutesToTime(this.selectedSlot(), duration);
  });

  /** Minutes since midnight, used to hide slots that have already passed. */
  private minutesSinceMidnight(): number | null {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  /* -------------------------------- handlers ------------------------------- */

  /**
   * Each handler is the single source of truth for its field: it updates both
   * the signal mirror (which drives the dependent `computed()`s) and the form
   * control. Relying on `formControlName` to set the control from the DOM event
   * while the handler set only the signal left the two out of step.
   */
  protected onServiceChange(value: string): void {
    const id = value === '' ? null : Number(value);
    this.selectedServiceId.set(id);
    this.form.controls.service.setValue(id);
    // A previously chosen staff member may not perform the new service, and the
    // slot grid depends on both.
    this.clearStaff();
    this.clearTime();
  }

  protected onStaffChange(value: string): void {
    const id = value === '' ? null : Number(value);
    this.selectedStaffId.set(id);
    this.form.controls.staff.setValue(id);
    // Different person, different diary.
    this.clearTime();
  }

  protected onDateChange(value: string): void {
    this.selectedDate.set(value);
    this.form.controls.booking_date.setValue(value);
    this.clearTime();
  }

  protected chooseSlot(start: string): void {
    this.selectedSlot.set(start);
    this.form.controls.start_time.setValue(start);
    this.form.controls.start_time.markAsTouched();
    this.form.controls.start_time.updateValueAndValidity();
  }

  private clearStaff(): void {
    this.selectedStaffId.set(null);
    this.form.controls.staff.reset(null);
    // The staff picker is meaningless until a service is chosen. `[disabled]`
    // on a `formControlName` element is ignored by the reactive-forms
    // directive, so the control itself has to be disabled.
    if (this.selectedServiceId() === null) {
      this.form.controls.staff.disable();
    } else {
      this.form.controls.staff.enable();
    }
  }

  private clearTime(): void {
    this.selectedSlot.set('');
    this.form.controls.start_time.reset('');
    this.form.controls.start_time.updateValueAndValidity();
  }

  protected reset(): void {
    this.form.reset({
      service: null,
      staff: null,
      booking_date: todayIso(),
      start_time: '',
      customer: null,
      notes: '',
    });
    this.selectedServiceId.set(null);
    this.selectedStaffId.set(null);
    this.selectedDate.set(todayIso());
    this.selectedSlot.set('');
  }

  /* --------------------------------- errors -------------------------------- */

  protected fieldError(
    name: 'customer' | 'service' | 'staff' | 'booking_date' | 'start_time',
  ): string {
    const backend = this.fieldErrors()[name];
    if (backend) {
      return backend;
    }
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    return {
      customer: 'Choose a customer.',
      service: 'Choose a service.',
      staff: 'Choose a staff member.',
      booking_date: 'Choose a date.',
      start_time: 'Choose a start time.',
    }[name];
  }

  /** Backend validation that is not attached to a field. */
  protected nonFieldError(): string {
    const errors = this.fieldErrors();
    return errors['non_field_errors'] ?? '';
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.submitted.emit({
      customer: value.customer,
      service: value.service,
      staff: value.staff,
      booking_date: value.booking_date,
      // The API wants "HH:MM:SS"; the slot grid produces "HH:MM".
      start_time: value.start_time.length === 5 ? `${value.start_time}:00` : value.start_time,
      status: 'PENDING',
      notes: value.notes,
    });
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected readonly formatDuration = formatDuration;
  protected readonly formatPrice = formatPrice;
  protected readonly formatDate = formatDate;
  protected readonly timeToMinutes = timeToMinutes;
}
