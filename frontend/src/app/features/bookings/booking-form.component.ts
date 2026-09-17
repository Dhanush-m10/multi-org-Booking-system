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

import type { BookingPayload, Customer, Service, Staff } from '../../core/models/api.models';
import { addMinutesToTime, formatDuration, formatPrice, todayIso } from '../../core/utils/datetime';
import { ButtonComponent } from '../../shared/components/button.component';
import { FieldComponent } from '../../shared/components/field.component';
import { IconComponent } from '../../shared/components/icon.component';

/**
 * Create-booking form.
 *
 * Payload mirrors `BookingSerializer`'s writable fields. `end_time` is never
 * sent — the backend derives it from the service duration, and this form only
 * *previews* that value so the user can see what they are booking.
 *
 * Dynamic dependencies:
 *  - picking a service narrows the staff list to people who (a) are active and
 *    (b) actually perform that service, which is the same rule the backend
 *    enforces in `validate()`. This keeps the picker honest; it is not a
 *    security boundary.
 *  - picking a service also previews the end time from `duration_minutes`.
 *  - the date input cannot be set before today, matching the backend rule.
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

  readonly saving = input(false);
  readonly formError = input('');
  readonly fieldErrors = input<Record<string, string>>({});

  readonly submitted = output<BookingPayload>();
  readonly cancelled = output<void>();

  protected readonly today = todayIso();

  /**
   * Signal mirrors of the two fields that drive dependent UI. Reactive-form
   * values are not signals, so a `computed()` over `control.value` would not
   * re-evaluate under zoneless change detection; the `(change)` / `(input)`
   * handlers below keep these in sync.
   */
  protected readonly selectedServiceId = signal<number | null>(null);
  private readonly startTime = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    customer: [null as number | null, [Validators.required]],
    service: [null as number | null, [Validators.required]],
    staff: [null as number | null, [Validators.required]],
    booking_date: [todayIso(), [Validators.required]],
    start_time: ['', [Validators.required]],
    notes: [''],
  });

  /* ------------------------------ dependencies ----------------------------- */

  /** Active services only — an inactive service should not be bookable. */
  protected readonly bookableServices = computed(() =>
    this.services().filter((service) => service.is_active),
  );

  protected readonly selectedService = computed(
    () => this.services().find((service) => service.id === this.selectedServiceId()) ?? null,
  );

  /**
   * Staff who can perform the selected service. Empty until a service is
   * chosen, so the picker never offers someone who would be rejected.
   */
  protected readonly availableStaff = computed(() => {
    const serviceId = this.selectedServiceId();
    if (serviceId === null) {
      return [];
    }
    return this.staff().filter((member) => member.is_active && member.services.includes(serviceId));
  });

  /** Active staff who could perform it but are flagged inactive — explained,
   *  not silently hidden. */
  protected readonly inactiveCapableStaff = computed(() => {
    const serviceId = this.selectedServiceId();
    if (serviceId === null) {
      return [];
    }
    return this.staff().filter(
      (member) => !member.is_active && member.services.includes(serviceId),
    );
  });

  protected readonly projectedEnd = computed(() => {
    const duration = this.selectedService()?.duration_minutes;
    if (!duration) {
      return null;
    }
    return addMinutesToTime(this.startTime(), duration);
  });

  /* ------------------------------- handlers -------------------------------- */

  protected onServiceChange(value: string): void {
    const id = value === '' ? null : Number(value);
    this.selectedServiceId.set(id);
    // A previously chosen staff member may not perform the new service.
    this.form.controls.staff.reset(null);
    this.form.controls.staff.updateValueAndValidity();
  }

  protected onStartTimeChange(value: string): void {
    this.startTime.set(value);
  }

  protected reset(): void {
    this.form.reset({
      customer: null,
      service: null,
      staff: null,
      booking_date: todayIso(),
      start_time: '',
      notes: '',
    });
    this.selectedServiceId.set(null);
    this.startTime.set('');
  }

  /* -------------------------------- errors --------------------------------- */

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
      // The API wants "HH:MM:SS".
      start_time: value.start_time.length === 5 ? `${value.start_time}:00` : value.start_time,
      status: 'PENDING',
      notes: value.notes,
    });
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected readonly formatDuration = formatDuration;
  protected readonly formatPrice = formatPrice;
}
