import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { BOOKING_STATUS_ACTIONS, BookingService } from '../../core/services/booking.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { CustomerService } from '../../core/services/customer.service';
import { StaffService } from '../../core/services/staff.service';
import { ToastService } from '../../core/services/toast.service';
import type {
  Booking,
  BookingStatus,
  Customer,
  Service,
  Staff,
} from '../../core/models/api.models';
import { apiErrorMessage } from '../../core/utils/api-errors';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatPrice,
  formatTime,
  initials,
  relativeDay,
} from '../../core/utils/datetime';
import { statusStyle } from '../../shared/booking-status';
import { ButtonComponent } from '../../shared/components/button.component';
import { CardComponent } from '../../shared/components/card.component';
import { ErrorStateComponent } from '../../shared/components/error-state.component';
import { FieldComponent } from '../../shared/components/field.component';
import { IconComponent, type IconName } from '../../shared/components/icon.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';

/**
 * Booking detail.
 *
 *   GET   /api/bookings/:id/
 *   PATCH /api/bookings/:id/   (status and/or notes only)
 *
 * DELETE is not implemented on the backend (it answers 405), so there is no
 * delete control here — cancelling is the supported way to release a slot.
 *
 * `id` arrives through `withComponentInputBinding()` from the `:id` route param.
 */
@Component({
  selector: 'app-booking-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    CardComponent,
    ErrorStateComponent,
    FieldComponent,
    IconComponent,
    SkeletonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './booking-detail.component.html',
})
export class BookingDetailComponent {
  private readonly bookingService = inject(BookingService);
  private readonly customerService = inject(CustomerService);
  private readonly catalog = inject(CatalogService);
  private readonly staffService = inject(StaffService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly booking = signal<Booking | null>(null);
  protected readonly busy = signal(false);

  private readonly customers = signal<Customer[]>([]);
  private readonly services = signal<Service[]>([]);
  private readonly staff = signal<Staff[]>([]);

  /** Notes editing. */
  protected readonly editingNotes = signal(false);
  protected readonly notesDraft = signal('');
  protected readonly savingNotes = signal(false);

  protected readonly statusActions = BOOKING_STATUS_ACTIONS;

  constructor() {
    // An effect rather than a constructor call: route-param inputs are not
    // guaranteed to be populated while the constructor body runs, and this also
    // reloads correctly when navigating between two booking details.
    effect(() => {
      const id = Number(this.id());
      if (Number.isFinite(id) && id > 0) {
        this.loadBooking(id);
      }
    });
  }

  protected load(): void {
    this.loadBooking(Number(this.id()));
  }

  private loadBooking(id: number): void {
    this.loading.set(true);
    this.error.set(null);

    // The detail response carries ids only, so the three lookup lists are
    // fetched alongside it to render names.
    forkJoin({
      booking: this.bookingService.getOne(id),
      customers: this.customerService.getAll(),
      services: this.catalog.getServices(),
      staff: this.staffService.getAll(),
    }).subscribe({
      next: ({ booking, customers, services, staff }) => {
        this.booking.set(booking);
        this.customers.set(customers);
        this.services.set(services);
        this.staff.set(staff);
        this.notesDraft.set(booking.notes);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  /* -------------------------------- lookups -------------------------------- */

  protected readonly customer = computed(
    () => this.customers().find((entry) => entry.id === this.booking()?.customer) ?? null,
  );
  protected readonly service = computed(
    () => this.services().find((entry) => entry.id === this.booking()?.service) ?? null,
  );
  protected readonly staffMember = computed(
    () => this.staff().find((entry) => entry.id === this.booking()?.staff) ?? null,
  );

  /* ------------------------------ status changes ---------------------------- */

  protected canSet(status: BookingStatus): boolean {
    return this.booking()?.status !== status;
  }

  protected setStatus(status: BookingStatus): void {
    const booking = this.booking();
    if (!booking || this.busy()) {
      return;
    }

    const run = () => {
      this.busy.set(true);
      this.bookingService.setStatus(booking.id, status).subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.booking.set(updated);
          this.toast.success(
            `Booking marked ${statusStyle(status).label.toLowerCase()}.`,
            'Booking updated',
          );
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.toast.error(apiErrorMessage(err), 'Could not update booking');
        },
      });
    };

    if (status === 'CANCELLED') {
      this.confirm
        .ask({
          title: 'Cancel booking?',
          message: 'This will cancel the selected appointment and release the staff member’s slot.',
          confirmLabel: 'Cancel booking',
          cancelLabel: 'Keep booking',
          tone: 'danger',
        })
        .subscribe((confirmed) => {
          if (confirmed) {
            run();
          }
        });
      return;
    }

    run();
  }

  /* --------------------------------- notes --------------------------------- */

  protected startEditingNotes(): void {
    this.notesDraft.set(this.booking()?.notes ?? '');
    this.editingNotes.set(true);
  }

  protected cancelEditingNotes(): void {
    this.notesDraft.set(this.booking()?.notes ?? '');
    this.editingNotes.set(false);
  }

  protected saveNotes(): void {
    const booking = this.booking();
    if (!booking || this.savingNotes()) {
      return;
    }

    this.savingNotes.set(true);
    this.bookingService.update(booking.id, { notes: this.notesDraft() }).subscribe({
      next: (updated) => {
        this.savingNotes.set(false);
        this.editingNotes.set(false);
        this.booking.set(updated);
        this.toast.success('Notes saved.', 'Booking updated');
      },
      error: (err: unknown) => {
        this.savingNotes.set(false);
        this.toast.error(apiErrorMessage(err), 'Could not save notes');
      },
    });
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected readonly statusStyle = statusStyle;
  protected readonly formatDate = formatDate;
  protected readonly formatTime = formatTime;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatDuration = formatDuration;
  protected readonly formatPrice = formatPrice;
  protected readonly initials = initials;
  protected readonly relativeDay = relativeDay;

  /** Icon per action, so the buttons are recognisable without reading them. */
  protected iconFor(status: BookingStatus): IconName {
    switch (status) {
      case 'CONFIRMED':
        return 'check';
      case 'COMPLETED':
        return 'checkCircle';
      case 'CANCELLED':
        return 'ban';
      default:
        return 'alert';
    }
  }
}
