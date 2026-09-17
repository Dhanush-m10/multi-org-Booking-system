import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DashboardService, type DashboardData } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { apiErrorMessage } from '../../core/utils/api-errors';
import {
  formatDate,
  formatDuration,
  formatPrice,
  formatTime,
  greeting,
  relativeDay,
} from '../../core/utils/datetime';
import { customerName, indexById, serviceName, staffName } from '../../core/utils/lookup';
import { BOOKING_STATUSES } from '../../shared/booking-status';
import { ButtonComponent } from '../../shared/components/button.component';
import { CardComponent } from '../../shared/components/card.component';
import { ErrorStateComponent } from '../../shared/components/error-state.component';
import { EmptyStateComponent } from '../../shared/components/state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';

/**
 * Dashboard.
 *
 * Every figure here is derived by `DashboardService` from the four real list
 * endpoints — there are no hard-coded or placeholder statistics. If a request
 * fails the screen shows an error state with Retry instead of inventing numbers.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    CardComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    IconComponent,
    SkeletonComponent,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly data = signal<DashboardData | null>(null);

  protected readonly heading = greeting();

  /**
   * The signed-in user's own username — real data captured at login.
   *
   * The organization name is deliberately NOT shown here. It cannot be
   * obtained: there is no /api/me, no organization endpoint of any kind
   * (`organizations/views.py` is empty and the app has no `urls.py`), the JWT
   * payload is only `{token_type, exp, iat, jti, user_id}`, and every record
   * exposes `organization` as a bare integer id. Verified: all of
   * `/api/me/`, `/api/auth/me/`, `/api/organizations/` return 404.
   *
   * A `GET /api/me/` returning the organization name is the backend change
   * that would allow a header like "Acme Clinic / Welcome back, Dhanush".
   * Until then, printing an organization name here would mean inventing one.
   */
  protected readonly username = this.authService.displayName;
  protected readonly todayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  /* ---- id -> name lookups, rebuilt only when the data changes ---- */

  private readonly customerIndex = computed(() => indexById(this.data()?.customers ?? []));
  private readonly staffIndex = computed(() => indexById(this.data()?.staff ?? []));
  private readonly serviceIndex = computed(() => indexById(this.data()?.services ?? []));

  /** Status rows for the distribution bar, non-zero statuses only. */
  protected readonly statusRows = computed(() => {
    const counts = this.data()?.statusCounts;
    if (!counts) {
      return [];
    }
    const total = BOOKING_STATUSES.reduce((sum, key) => sum + counts[key], 0);
    return BOOKING_STATUSES.filter((key) => counts[key] > 0).map((key) => ({
      key,
      count: counts[key],
      percent: total === 0 ? 0 : Math.round((counts[key] / total) * 100),
    }));
  });

  /**
   * Setup checklist. Only lists steps that are genuinely incomplete, based on
   * the data just fetched — never a static "getting started" panel.
   */
  protected readonly setupSteps = computed(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const steps: Array<{ label: string; href: string; done: boolean }> = [
      {
        label: 'Add a service category and your first service',
        href: '/services',
        done: data.services.length > 0,
      },
      {
        label: 'Add staff and assign the services they perform',
        href: '/staff',
        done: data.staff.length > 0,
      },
      {
        label: 'Set working hours so slots can be booked',
        href: '/availability',
        done: data.hasWorkingHours,
      },
      {
        label: 'Add a customer',
        href: '/customers',
        done: data.customers.length > 0,
      },
    ];
    return steps;
  });

  protected readonly setupIncomplete = computed(() => this.setupSteps().some((step) => !step.done));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.dashboardService.load().subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  /* ---- template helpers ---- */

  protected name(kind: 'customer' | 'staff' | 'service', id: number): string {
    switch (kind) {
      case 'customer':
        return customerName(this.customerIndex(), id);
      case 'staff':
        return staffName(this.staffIndex(), id);
      case 'service':
        return serviceName(this.serviceIndex(), id);
    }
  }

  protected readonly formatTime = formatTime;
  protected readonly formatDate = formatDate;
  protected readonly relativeDay = relativeDay;
  protected readonly formatDuration = formatDuration;
  protected readonly formatPrice = formatPrice;
}
