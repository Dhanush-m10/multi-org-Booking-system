import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { CustomerBookingService } from '../../core/services/customer-booking.service';
import { PublicOrganizationService } from '../../core/services/public-organization.service';
import { TokenService } from '../../core/services/token.service';
import { ToastService } from '../../core/services/toast.service';
import type { Booking, BookingStatus, PublicOrganization } from '../../core/models/api.models';
import { apiErrorMessage } from '../../core/utils/api-errors';
import {
  compareBookingTimes,
  formatDate,
  formatTime,
  relativeDay,
} from '../../core/utils/datetime';
import { ButtonComponent } from '../../shared/components/button.component';
import { CardComponent } from '../../shared/components/card.component';
import { ErrorStateComponent } from '../../shared/components/error-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/state.component';

/**
 * A signed-in customer's own bookings.
 *
 *   GET  /api/customer/bookings/
 *   POST /api/customer/bookings/:id/cancel/
 *
 * The list is filtered to the caller on the server. Nothing here re-filters by
 * customer or organization, and nothing here could: the endpoint returns only
 * the caller's bookings in the first place, so there is no other data in memory
 * to filter. That is deliberate — hiding a row in the browser would not be
 * authorization.
 *
 * Cancellation is the only mutation offered. There is no reschedule, no staff
 * reassignment and no status picker: the backend exposes no such operation to a
 * customer, and `CustomerBookingService` has no method that could call one.
 *
 * Service and staff names are resolved through the PUBLIC organization API using
 * the slug from the signed-in user's own session. The booking payload itself
 * carries only integer ids, and no management endpoint is involved.
 */
@Component({
  selector: 'app-customer-bookings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    CardComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    IconComponent,
    SkeletonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './customer-bookings.component.html',
})
export class CustomerBookingsComponent {
  private readonly customerBookings = inject(CustomerBookingService);
  private readonly publicApi = inject(PublicOrganizationService);
  private readonly tokenService = inject(TokenService);
  private readonly authService = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly bookings = signal<Booking[]>([]);
  protected readonly organization = signal<PublicOrganization | null>(null);
  protected readonly cancellingId = signal<number | null>(null);

  /** id -> display name, built from the public catalogue. */
  private readonly serviceNames = signal<Record<number, string>>({});
  private readonly staffNames = signal<Record<number, string>>({});

  protected readonly organizationSlug = this.tokenService.organizationSlug;
  protected readonly displayName = this.tokenService.displayName;

  /** Upcoming first, so the next appointment is at the top. */
  protected readonly sortedBookings = computed(() =>
    [...this.bookings()].sort((a, b) => compareBookingTimes(b, a)),
  );

  protected readonly upcomingCount = computed(
    () =>
      this.bookings().filter(
        (booking) => booking.status === 'PENDING' || booking.status === 'CONFIRMED',
      ).length,
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    const slug = this.organizationSlug();

    // The catalogue lookup is best-effort: if it fails the bookings still
    // render, with ids in place of names, rather than the screen failing.
    const catalogue = slug
      ? forkJoin({
          organization: this.publicApi.getOrganization(slug),
          services: this.publicApi.getServices(slug),
          staff: this.publicApi.getStaff(slug),
        })
      : null;

    if (catalogue) {
      catalogue.subscribe({
        next: (result) => {
          this.organization.set(result.organization);
          this.serviceNames.set(Object.fromEntries(result.services.map((s) => [s.id, s.name])));
          this.staffNames.set(Object.fromEntries(result.staff.map((m) => [m.id, m.name])));
        },
        error: () => {
          /* names stay unresolved; the list below still works */
        },
      });
    }

    this.customerBookings.getAll().subscribe({
      next: (bookings) => {
        this.bookings.set(bookings);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected serviceName(id: number): string {
    return this.serviceNames()[id] ?? `Service #${id}`;
  }

  protected staffName(id: number): string {
    return this.staffNames()[id] ?? `Staff member #${id}`;
  }

  /** Only a pending or confirmed appointment can still be cancelled. */
  protected canCancel(booking: Booking): boolean {
    return booking.status === 'PENDING' || booking.status === 'CONFIRMED';
  }

  protected cancel(booking: Booking): void {
    if (this.cancellingId() !== null) {
      return;
    }

    this.confirmService
      .ask({
        title: 'Cancel this booking?',
        message: `${this.serviceName(booking.service)} on ${formatDate(
          booking.booking_date,
        )} at ${formatTime(booking.start_time)}. This cannot be undone.`,
        confirmLabel: 'Cancel booking',
        cancelLabel: 'Keep it',
        tone: 'danger',
      })
      .subscribe((accepted) => {
        if (!accepted) {
          return;
        }

        this.cancellingId.set(booking.id);
        this.customerBookings.cancel(booking.id).subscribe({
          next: (updated) => {
            this.cancellingId.set(null);
            this.bookings.update((list) =>
              list.map((item) => (item.id === updated.id ? updated : item)),
            );
            this.toast.success('The booking was cancelled.', 'Booking cancelled');
          },
          error: (err: unknown) => {
            this.cancellingId.set(null);
            // 404 means it is not ours, 400 means its status no longer allows
            // it. Either way the backend's own message is the honest answer.
            this.toast.error(apiErrorMessage(err), 'Could not cancel');
            this.load();
          },
        });
      });
  }

  protected bookAgainUrl(): string[] {
    const slug = this.organizationSlug();
    return slug ? ['/book', slug] : ['/book'];
  }

  protected signOut(): void {
    this.authService.logout(false);
    void this.router.navigate(['/login']);
  }

  protected readonly formatDate = formatDate;
  protected readonly formatTime = formatTime;
  protected readonly relativeDay = relativeDay;
  protected readonly statusLabels: Record<BookingStatus, string> = {
    PENDING: 'Awaiting confirmation',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    NO_SHOW: 'No show',
  };
}
