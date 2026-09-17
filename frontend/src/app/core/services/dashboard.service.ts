import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';

import type { Booking, BookingStatus, Customer, Service, Staff } from '../models/api.models';
import { todayIso } from '../utils/datetime';
import { BookingService } from './booking.service';
import { CustomerService } from './customer.service';
import { AvailabilityService } from './availability.service';
import { CatalogService } from './catalog.service';
import { StaffService } from './staff.service';

/**
 * Dashboard aggregation.
 *
 * There is no analytics endpoint on the backend, so every number shown on the
 * dashboard is *derived* from the four list endpoints the app already uses.
 * Nothing here is hard-coded or estimated — if a list is empty the card reads
 * zero, and if a call fails the dashboard shows an error state with Retry
 * rather than inventing a plausible number.
 */

/** Statuses that still represent an appointment that is going to happen. */
const UPCOMING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export interface DashboardData {
  customers: Customer[];
  staff: Staff[];
  services: Service[];
  bookings: Booking[];

  /** Derived counters. */
  totals: {
    customers: number;
    staff: number;
    activeStaff: number;
    services: number;
    activeServices: number;
    upcoming: number;
    today: number;
  };

  todayBookings: Booking[];
  upcomingBookings: Booking[];
  recentBookings: Booking[];
  statusCounts: Record<BookingStatus, number>;
  /** Sum of service prices for today's non-cancelled bookings. */
  todayValue: number;
  /** True once at least one working-hours row exists for the organization. */
  hasWorkingHours: boolean;
}

const EMPTY_STATUS_COUNTS: Record<BookingStatus, number> = {
  PENDING: 0,
  CONFIRMED: 0,
  CANCELLED: 0,
  COMPLETED: 0,
  NO_SHOW: 0,
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly bookings = inject(BookingService);
  private readonly customers = inject(CustomerService);
  private readonly staff = inject(StaffService);
  private readonly catalog = inject(CatalogService);
  private readonly availability = inject(AvailabilityService);

  /**
   * Load everything the dashboard needs in parallel and reduce it to one
   * object the component can render directly.
   *
   * The working-hours call is included so the "set up availability" nudge on
   * the dashboard only appears when the organization genuinely has none.
   */
  load(): Observable<DashboardData> {
    return forkJoin({
      customers: this.customers.getAll(),
      staff: this.staff.getAll(),
      services: this.catalog.getServices(),
      bookings: this.bookings.getAll(),
      workingHours: this.availability.getAll(),
    }).pipe(map((result) => this.reduce(result)));
  }

  private reduce(input: {
    customers: Customer[];
    staff: Staff[];
    services: Service[];
    bookings: Booking[];
    workingHours: unknown[];
  }): DashboardData {
    const today = todayIso();

    const byId = new Map(input.services.map((service) => [service.id, service]));
    const priceOf = (booking: Booking): number =>
      Number(byId.get(booking.service)?.price ?? 0) || 0;

    const todayBookings = input.bookings
      .filter((booking) => booking.booking_date === today)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    const upcomingBookings = input.bookings
      .filter(
        (booking) => booking.booking_date >= today && UPCOMING_STATUSES.includes(booking.status),
      )
      .sort((a, b) =>
        a.booking_date === b.booking_date
          ? a.start_time.localeCompare(b.start_time)
          : a.booking_date.localeCompare(b.booking_date),
      );

    const statusCounts = { ...EMPTY_STATUS_COUNTS };
    for (const booking of input.bookings) {
      statusCounts[booking.status] = (statusCounts[booking.status] ?? 0) + 1;
    }

    return {
      customers: input.customers,
      staff: input.staff,
      services: input.services,
      bookings: input.bookings,

      totals: {
        customers: input.customers.length,
        staff: input.staff.length,
        activeStaff: input.staff.filter((member) => member.is_active).length,
        services: input.services.length,
        activeServices: input.services.filter((s) => s.is_active).length,
        upcoming: upcomingBookings.length,
        today: todayBookings.filter((b) => b.status !== 'CANCELLED').length,
      },

      todayBookings,
      upcomingBookings: upcomingBookings.slice(0, 8),
      recentBookings: [...input.bookings]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 6),
      statusCounts,

      todayValue: todayBookings
        .filter((booking) => booking.status !== 'CANCELLED')
        .reduce((sum, booking) => sum + priceOf(booking), 0),

      // Exposed for the onboarding nudge.
      hasWorkingHours: input.workingHours.length > 0,
    };
  }
}
