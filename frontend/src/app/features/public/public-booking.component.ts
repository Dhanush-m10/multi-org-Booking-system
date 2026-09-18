import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { CustomerBookingService } from '../../core/services/customer-booking.service';
import { PublicOrganizationService } from '../../core/services/public-organization.service';
import { ToastService } from '../../core/services/toast.service';
import type {
  AvailabilitySlot,
  Booking,
  PublicOrganization,
  PublicService,
  PublicStaff,
} from '../../core/models/api.models';
import { apiErrorMessage, toApiError } from '../../core/utils/api-errors';
import {
  formatDate,
  formatDuration,
  formatPrice,
  formatTime,
  todayIso,
} from '../../core/utils/datetime';
import { CardComponent } from '../../shared/components/card.component';
import { ErrorStateComponent } from '../../shared/components/error-state.component';
import { IconComponent } from '../../shared/components/icon.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { EmptyStateComponent } from '../../shared/components/state.component';

/** The stages of the customer flow, in order. */
const STEPS = ['services', 'staff', 'date', 'confirmation'] as const;
type Step = (typeof STEPS)[number];

/**
 * Customer booking portal — the public, customer-facing half of the app.
 *
 * Deliberately outside `AppShell`: no sidebar, no dashboard, no management
 * chrome. Everything it renders comes from the unauthenticated public API
 * (`/api/public/organizations/<slug>/...`), which returns only active services,
 * active staff and real availability for the one organization named by the slug
 * in the URL.
 *
 * HOW THE FLOW WORKS
 *   services -> staff -> date -> confirmation
 * Each stage is its own route; `BookingDraftService` carries the selection
 * between them. A stage that is missing a prerequisite sends the visitor back
 * to the earliest stage they can actually complete, so a deep link to
 * `/book/acme-clinic/date` cannot render an empty picker.
 *
 * WHAT IS NEVER ASKED OF THE VISITOR
 *   - an organization id: the slug in the URL is the only selector, and the
 *     backend resolves it to exactly one organization
 *   - a customer id or an organization id at submit time: `POST
 *     /api/customer/bookings/` derives both from the signed-in user, and
 *     `CustomerBookingPayload` has no such fields to send
 *
 * Authentication is only required at the last step. Browsing is anonymous, so a
 * visitor can pick a service, a person and a time before deciding to sign in.
 *
 * There is no mock data anywhere in this flow: if the organization has no
 * services, the screen says so rather than inventing a list.
 */
@Component({
  selector: 'app-public-booking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CardComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    IconComponent,
    SkeletonComponent,
  ],
  templateUrl: './public-booking.component.html',
})
export class PublicBookingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publicApi = inject(PublicOrganizationService);
  private readonly customerBookings = inject(CustomerBookingService);
  protected readonly draft = inject(BookingDraftService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** From `/book/:organizationSlug`. Echoed back to the API, never guessed. */
  readonly organizationSlug = input<string>('');

  /**
   * From `/book/:organizationSlug/:step`. Only the catch-all route declares a
   * `:step` param — the named routes carry the stage in route `data`, which
   * `withComponentInputBinding()` does not bind, hence the `data` fallback.
   */
  readonly step = input<string>('');

  /* ------------------------------- catalog -------------------------------- */

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** Distinct from `error`: a 404 means the slug names no organization. */
  protected readonly notFound = signal(false);

  protected readonly organization = signal<PublicOrganization | null>(null);
  protected readonly services = signal<PublicService[]>([]);
  protected readonly staff = signal<PublicStaff[]>([]);

  /* -------------------------------- slots --------------------------------- */

  protected readonly slotsLoading = signal(false);
  protected readonly slotsError = signal<string | null>(null);
  protected readonly slots = signal<AvailabilitySlot[]>([]);
  /** No working hours configured for the chosen weekday. */
  protected readonly noWorkingHours = signal(false);

  protected readonly minDate = todayIso();

  /* ------------------------------- submit --------------------------------- */

  protected readonly saving = signal(false);
  protected readonly submitError = signal('');
  protected readonly confirmedBooking = signal<Booking | null>(null);

  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly notes = signal('');

  /* ------------------------------ derivation ------------------------------ */

  /** The stage to render. Falls back to `services` for the bare /book/<slug>. */
  protected readonly currentStep = computed<Step>(() => {
    const requested = this.step() || (this.route.snapshot.data['step'] as string | undefined) || '';
    return (STEPS as readonly string[]).includes(requested) ? (requested as Step) : 'services';
  });

  protected readonly stepIndex = computed(() => STEPS.indexOf(this.currentStep()));

  /** Only staff who actually perform the chosen service. */
  protected readonly eligibleStaff = computed(() => {
    const service = this.draft.service();
    if (!service) {
      return [];
    }
    return this.staff().filter((member) => member.service_ids.includes(service.id));
  });

  protected readonly availableSlots = computed(() => this.slots().filter((slot) => slot.available));

  /** Where to send a visitor who must sign in, so they land back here. */
  protected readonly returnUrl = computed(() => this.router.url);

  protected readonly registerUrl = computed(() => ['/book', this.organizationSlug(), 'register']);

  constructor() {
    // Reload the catalogue whenever the slug changes, and drop a draft that
    // belongs to a different organization: service and staff ids are only
    // meaningful inside their own organization.
    //
    // The body is wrapped in `untracked` because it READS `draft.slug()` (inside
    // `isFor`) and then WRITES it (inside `begin`). Without `untracked` the
    // effect would register its own write as a dependency, invalidate itself
    // and run a second time — fetching the whole catalogue twice on every
    // load. Only `organizationSlug()` should trigger a reload.
    effect(() => {
      const slug = this.organizationSlug();
      if (!slug) {
        return;
      }
      untracked(() => {
        if (!this.draft.isFor(slug)) {
          this.draft.begin(slug);
        }
        this.load(slug);
      });
    });

    // The wizard's steps are separate routes that share one component instance,
    // so navigating between them changes `step` without re-running the
    // constructor. The slot list is deliberately NOT part of the draft (it is
    // derived data that goes stale the moment someone else books), so returning
    // to the date step — browser Back from the confirmation screen, or the
    // "Change time" button — would otherwise render an empty list and report
    // "no times left" for a day that is actually free.
    //
    // Reading only `currentStep()` keeps this effect from re-triggering on its
    // own writes; the draft signals are read inside `untracked`.
    effect(() => {
      if (this.currentStep() !== 'date') {
        return;
      }
      untracked(() => {
        const date = this.draft.date();
        if (date && !this.slotsLoading() && this.slots().length === 0) {
          this.loadSlots(date);
        }
      });
    });
  }

  /* ------------------------------- loading -------------------------------- */

  protected load(slug: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);

    forkJoin({
      organization: this.publicApi.getOrganization(slug),
      services: this.publicApi.getServices(slug),
      staff: this.publicApi.getStaff(slug),
    }).subscribe({
      next: (result) => {
        this.organization.set(result.organization);
        this.services.set(result.services);
        this.staff.set(result.staff);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const apiError = toApiError(err);
        // A bad slug is not a failure to report; it is an unknown organization.
        if (apiError.status === 404) {
          this.notFound.set(true);
        } else {
          this.error.set(apiError.message);
        }
      },
    });
  }

  /* ------------------------------ navigation ------------------------------ */

  protected goTo(step: Step): void {
    void this.router.navigate(['/book', this.organizationSlug(), step]);
  }

  protected chooseService(service: PublicService): void {
    // Changing the service invalidates the staff and time already chosen: a
    // different service may have a different duration and different performers.
    const changed = this.draft.service()?.id !== service.id;
    this.draft.service.set(service);
    if (changed) {
      this.draft.staff.set(null);
      this.draft.startTime.set('');
      this.draft.endTime.set('');
      this.slots.set([]);
    }
    this.goTo('staff');
  }

  protected chooseStaff(member: PublicStaff): void {
    const changed = this.draft.staff()?.id !== member.id;
    this.draft.staff.set(member);
    if (changed) {
      this.draft.startTime.set('');
      this.draft.endTime.set('');
      this.slots.set([]);
    }
    this.goTo('date');
  }

  protected backToServices(): void {
    this.goTo('services');
  }

  protected backToStaff(): void {
    this.goTo('staff');
  }

  /* -------------------------------- slots --------------------------------- */

  protected onDateChange(value: string): void {
    this.draft.date.set(value);
    this.draft.startTime.set('');
    this.draft.endTime.set('');
    this.slots.set([]);
    this.slotsError.set(null);
    this.noWorkingHours.set(false);

    if (!value) {
      return;
    }
    this.loadSlots(value);
  }
  private loadSlots(date: string): void {
    const service = this.draft.service();
    const staffMember = this.draft.staff();
    if (!service || !staffMember) {
      this.goTo('services');
      return;
    }

    this.slotsLoading.set(true);
    this.publicApi
      .getSlots(this.organizationSlug(), {
        service: service.id,
        staff: staffMember.id,
        date,
      })
      .subscribe({
        next: (response) => {
          this.slots.set(response.slots);
          this.noWorkingHours.set(response.working_hours === null);
          this.slotsLoading.set(false);
        },
        error: (err: unknown) => {
          this.slotsLoading.set(false);
          this.slots.set([]);
          this.slotsError.set(apiErrorMessage(err));
        },
      });
  }

  protected chooseSlot(slot: AvailabilitySlot): void {
    if (!slot.available) {
      return;
    }
    this.draft.startTime.set(slot.start);
    this.draft.endTime.set(slot.end);
    this.goTo('confirmation');
  }

  /* -------------------------------- submit -------------------------------- */

  protected confirm(): void {
    if (this.saving()) {
      return;
    }

    // Signing in is required to book. Send the visitor to /login (or the
    // organization's own registration page) with a way back to this exact step,
    // so the selection they made is still waiting in the draft.
    if (!this.isAuthenticated()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.returnUrl() },
      });
      return;
    }

    const service = this.draft.service();
    const staffMember = this.draft.staff();
    if (!service || !staffMember || !this.draft.date() || !this.draft.startTime()) {
      this.goTo('services');
      return;
    }

    this.saving.set(true);
    this.submitError.set('');

    this.customerBookings
      .create({
        // No customer id and no organization id: the backend takes both from
        // the token, and the payload type does not allow them.
        service: service.id,
        staff: staffMember.id,
        booking_date: this.draft.date(),
        start_time: this.draft.startTime(),
        notes: this.notes(),
      })
      .subscribe({
        next: (booking) => {
          this.saving.set(false);
          this.confirmedBooking.set(booking);
          this.draft.clearSelection();
          this.slots.set([]);
          this.toast.success('Your booking request has been sent.', 'Booking received');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          // Surface the backend's own message. It re-validates every rule, so a
          // slot taken by someone else a moment ago is reported honestly here
          // rather than being hidden by client-side assumptions.
          this.submitError.set(apiErrorMessage(err));
        },
      });
  }

  protected onNotesChange(value: string): void {
    this.notes.set(value);
  }

  protected startAnother(): void {
    this.confirmedBooking.set(null);
    this.notes.set('');
    this.submitError.set('');
    this.goTo('services');
  }

  /* ------------------------------- formatting ----------------------------- */

  protected readonly formatDuration = formatDuration;
  protected readonly formatPrice = formatPrice;
  protected readonly formatTime = formatTime;
  protected readonly formatDate = formatDate;
}
