import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, of } from 'rxjs';

import { AvailabilityService } from '../../core/services/availability.service';
import { BOOKING_STATUS_ACTIONS, BookingService } from '../../core/services/booking.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { CustomerService } from '../../core/services/customer.service';
import { StaffService } from '../../core/services/staff.service';
import { ToastService } from '../../core/services/toast.service';
import type {
  Booking,
  BookingPayload,
  BookingStatus,
  Customer,
  Service,
  Staff,
  WorkingHours,
} from '../../core/models/api.models';
import { apiErrorMessage, toApiError } from '../../core/utils/api-errors';
import {
  compareBookingTimes,
  formatDate,
  formatTime,
  relativeDay,
  todayIso,
} from '../../core/utils/datetime';
import {
  customerName,
  indexById,
  matches,
  searchable,
  serviceName,
  staffName,
} from '../../core/utils/lookup';
import { BOOKING_STATUSES, statusStyle } from '../../shared/booking-status';
import { ButtonComponent } from '../../shared/components/button.component';
import { CardComponent } from '../../shared/components/card.component';
import { ErrorStateComponent } from '../../shared/components/error-state.component';
import { EmptyStateComponent } from '../../shared/components/state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import {
  ResultCountComponent,
  SearchInputComponent,
} from '../../shared/components/search-input.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { BookingFormComponent } from './booking-form.component';

/**
 * Bookings.
 *
 *   GET|POST       /api/bookings/
 *   GET|PATCH      /api/bookings/:id/
 *
 * Filtering, searching and sorting all happen in the browser because the list
 * endpoint takes no query parameters and returns a plain array. The service
 * layer is written so a paginated, server-filtered endpoint can be dropped in
 * later without changing this template.
 *
 * Nothing here re-implements the backend's booking rules. Overlaps, working
 * hours, past dates and staff/service compatibility are all decided by
 * `BookingSerializer.validate`; this page just presents whatever it returns.
 */
type RangeFilter = 'all' | 'today' | 'upcoming' | 'past';

@Component({
  selector: 'app-bookings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BookingFormComponent,
    ButtonComponent,
    CardComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    IconComponent,
    ModalComponent,
    PageHeaderComponent,
    ResultCountComponent,
    SearchInputComponent,
    SkeletonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './bookings-page.component.html',
})
export class BookingsPageComponent {
  private readonly bookingService = inject(BookingService);
  private readonly customerService = inject(CustomerService);
  private readonly catalog = inject(CatalogService);
  private readonly staffService = inject(StaffService);
  private readonly availabilityService = inject(AvailabilityService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly bookings = signal<Booking[]>([]);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly services = signal<Service[]>([]);
  protected readonly staff = signal<Staff[]>([]);
  protected readonly workingHours = signal<WorkingHours[]>([]);

  /**
   * True when an ADMIN-only lookup (services / staff / working-hours) was
   * refused. Bookings and customers are readable by any organization member,
   * so the list still renders — but names resolve to placeholders and the
   * create dialog cannot work. Shown as a banner rather than failing the page.
   */
  protected readonly degraded = signal(false);

  /* --------------------------------- filters -------------------------------- */

  protected readonly search = signal('');
  protected readonly statusFilter = signal<string>('all');
  protected readonly staffFilter = signal<string>('all');
  protected readonly serviceFilter = signal<string>('all');
  protected readonly customerFilter = signal<string>('all');
  protected readonly dateFilter = signal<string>('');
  protected readonly rangeFilter = signal<RangeFilter>('upcoming');

  /** 'list' = flat table, 'day' = grouped by date. */
  protected readonly view = signal<'list' | 'day'>('list');

  protected setView(view: 'list' | 'day'): void {
    this.view.set(view);
  }

  protected readonly statusOptions = BOOKING_STATUSES;

  /* --------------------------------- dialog --------------------------------- */

  protected readonly createOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly createError = signal('');
  protected readonly createFieldErrors = signal<Record<string, string>>({});
  /** Id of the row whose status change is in flight. */
  protected readonly busyId = signal<number | null>(null);

  constructor() {
    this.load();
    this.applyQueryParams();
  }

  /** Honour deep links from the dashboard: ?create=1, ?customer=3, ?status=… */
  private applyQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('create') === '1') {
      this.createOpen.set(true);
    }
    const customer = params.get('customer');
    if (customer) {
      this.customerFilter.set(customer);
      this.rangeFilter.set('all');
    }
    const status = params.get('status');
    if (status) {
      this.statusFilter.set(status);
      this.rangeFilter.set('all');
    }
    const date = params.get('date');
    if (date) {
      this.dateFilter.set(date);
      this.rangeFilter.set('all');
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    let refusedLookup = false;

    /**
     * services, staff and working-hours are `IsOrganizationAdmin` on the
     * backend. A STAFF-role member gets 403, and inside `forkJoin` one error
     * would sink the whole screen — including the bookings they ARE allowed to
     * see. So these three degrade to an empty list instead.
     */
    const tolerateAdminOnly = <T>(source: Observable<T[]>) =>
      source.pipe(
        catchError(() => {
          refusedLookup = true;
          return of([] as T[]);
        }),
      );

    forkJoin({
      bookings: this.bookingService.getAll(),
      customers: this.customerService.getAll(),
      services: tolerateAdminOnly(this.catalog.getServices()),
      staff: tolerateAdminOnly(this.staffService.getAll()),
      workingHours: tolerateAdminOnly(this.availabilityService.getAll()),
    }).subscribe({
      next: (result) => {
        this.bookings.set(result.bookings);
        this.customers.set(result.customers);
        this.services.set(result.services);
        this.staff.set(result.staff);
        this.workingHours.set(result.workingHours);
        this.degraded.set(refusedLookup);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  /* -------------------------------- lookups -------------------------------- */

  private readonly customerIndex = computed(() => indexById(this.customers()));
  private readonly serviceIndex = computed(() => indexById(this.services()));
  private readonly staffIndex = computed(() => indexById(this.staff()));

  protected name(kind: 'customer' | 'service' | 'staff', id: number): string {
    switch (kind) {
      case 'customer':
        return customerName(this.customerIndex(), id);
      case 'service':
        return serviceName(this.serviceIndex(), id);
      case 'staff':
        return staffName(this.staffIndex(), id);
    }
  }

  /* -------------------------------- filtering ------------------------------- */

  protected readonly filtered = computed(() => {
    const term = this.search();
    const status = this.statusFilter();
    const staffId = this.staffFilter();
    const serviceId = this.serviceFilter();
    const customerId = this.customerFilter();
    const date = this.dateFilter();
    const range = this.rangeFilter();
    const today = todayIso();

    return this.bookings()
      .filter((booking) => {
        if (status !== 'all' && booking.status !== status) {
          return false;
        }
        if (staffId !== 'all' && booking.staff !== Number(staffId)) {
          return false;
        }
        if (serviceId !== 'all' && booking.service !== Number(serviceId)) {
          return false;
        }
        if (customerId !== 'all' && booking.customer !== Number(customerId)) {
          return false;
        }
        if (date && booking.booking_date !== date) {
          return false;
        }

        switch (range) {
          case 'today':
            if (booking.booking_date !== today) {
              return false;
            }
            break;
          case 'upcoming':
            if (booking.booking_date < today) {
              return false;
            }
            break;
          case 'past':
            if (booking.booking_date >= today) {
              return false;
            }
            break;
        }

        return matches(
          searchable(
            this.name('customer', booking.customer),
            this.name('service', booking.service),
            this.name('staff', booking.staff),
            booking.notes,
          ),
          term,
        );
      })
      .sort(compareBookingTimes);
  });

  /** Bookings grouped by date, for the day view. */
  protected readonly groupedByDate = computed(() => {
    const groups = new Map<string, Booking[]>();
    for (const booking of this.filtered()) {
      const list = groups.get(booking.booking_date);
      if (list) {
        list.push(booking);
      } else {
        groups.set(booking.booking_date, [booking]);
      }
    }
    return [...groups.entries()].map(([date, items]) => ({ date, items }));
  });

  protected readonly hasActiveFilters = computed(
    () =>
      this.search() !== '' ||
      this.statusFilter() !== 'all' ||
      this.staffFilter() !== 'all' ||
      this.serviceFilter() !== 'all' ||
      this.customerFilter() !== 'all' ||
      this.dateFilter() !== '' ||
      this.rangeFilter() !== 'upcoming',
  );

  protected resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.staffFilter.set('all');
    this.serviceFilter.set('all');
    this.customerFilter.set('all');
    this.dateFilter.set('');
    this.rangeFilter.set('upcoming');
    // Drop the deep-link params so a reload does not re-apply them.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
    });
  }

  /* ------------------------------ create booking ---------------------------- */

  protected openCreate(): void {
    this.createError.set('');
    this.createFieldErrors.set({});
    this.createOpen.set(true);
  }

  protected closeCreate(): void {
    if (!this.saving()) {
      this.createOpen.set(false);
    }
  }

  protected onCreate(payload: BookingPayload): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.createError.set('');
    this.createFieldErrors.set({});

    this.bookingService.create(payload).subscribe({
      next: (booking) => {
        this.saving.set(false);
        this.createOpen.set(false);
        this.bookings.update((list) => [...list, booking]);
        this.toast.success(
          `Booked ${this.name('customer', booking.customer)} for ${formatDate(
            booking.booking_date,
          )} at ${formatTime(booking.start_time)}.`,
          'Booking created',
        );
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const apiError = toApiError(err);
        const mapped: Record<string, string> = {};
        for (const [key, messages] of Object.entries(apiError.fieldErrors)) {
          if (messages.length > 0) {
            mapped[key] = messages[0]!;
          }
        }
        if (apiError.nonFieldErrors.length > 0) {
          mapped['non_field_errors'] = apiError.nonFieldErrors.join(' ');
        }
        this.createFieldErrors.set(mapped);
        // Surface the backend's own words — e.g. "Staff member already has a
        // booking during this time."
        this.createError.set(apiError.message);
      },
    });
  }

  /* ------------------------------ status changes ---------------------------- */

  protected canSet(booking: Booking, status: BookingStatus): boolean {
    return booking.status !== status;
  }

  protected changeStatus(booking: Booking, status: BookingStatus): void {
    const action = BOOKING_STATUS_ACTIONS.find((a) => a.status === status);
    if (!action || this.busyId() !== null) {
      return;
    }

    // Cancelling is destructive, so it gets an explicit confirmation.
    if (status === 'CANCELLED') {
      this.confirm
        .ask({
          title: 'Cancel booking?',
          message: `${this.name('customer', booking.customer)} · ${formatDate(
            booking.booking_date,
          )} at ${formatTime(booking.start_time)}. This releases the staff member's slot.`,
          confirmLabel: 'Cancel booking',
          cancelLabel: 'Keep booking',
          tone: 'danger',
        })
        .subscribe((confirmed) => {
          if (confirmed) {
            this.applyStatus(booking.id, status);
          }
        });
      return;
    }

    this.applyStatus(booking.id, status);
  }

  private applyStatus(id: number, status: BookingStatus): void {
    this.busyId.set(id);

    this.bookingService.setStatus(id, status).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.bookings.update((list) =>
          list.map((booking) => (booking.id === id ? updated : booking)),
        );
        this.toast.success(
          `Booking marked ${statusStyle(status).label.toLowerCase()}.`,
          'Booking updated',
        );
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.toast.error(apiErrorMessage(err), 'Could not update booking');
      },
    });
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected readonly formatDate = formatDate;
  protected readonly formatTime = formatTime;
  protected readonly relativeDay = relativeDay;
  protected readonly todayIso = todayIso();
  protected readonly statusStyle = statusStyle;
}
