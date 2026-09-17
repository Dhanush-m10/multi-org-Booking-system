import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../shared/components/button.component';
import { IconComponent, type IconName } from '../../shared/components/icon.component';

/** The steps the customer flow will have once the backend supports it. */
interface PlannedStep {
  label: string;
  hint: string;
  icon: IconName;
}

/**
 * Customer-facing booking portal — NOT YET OPERATIONAL.
 *
 * This component exists so the two experiences are structurally separate from
 * the start: `/login`..`/availability` is the organization management portal,
 * and `/book/...` is the public customer portal. It renders no data, calls no
 * endpoint and contains no mock records, because none of the four backend
 * capabilities it needs exist today:
 *
 *  1. ORGANIZATION LOOKUP BY SLUG
 *     `Organization` has no `slug` field (only name/email/phone/address), there
 *     is no `organizations/urls.py`, and `organizations/views.py` is empty — so
 *     `/book/abc-clinic` cannot be resolved to an organization. Every
 *     organization-aware endpoint instead derives the organization from the
 *     authenticated user's `OrganizationMembership`.
 *
 *  2. PUBLIC (UNAUTHENTICATED) READ ACCESS
 *     `REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"]` is `IsAuthenticated`, and
 *     each view sets `IsOrganizationAdmin` or `IsOrganizationStaff`. A request
 *     with no token gets 401 from every resource endpoint, so a visitor cannot
 *     even list an organization's services.
 *
 *  3. CUSTOMER AUTHENTICATION
 *     `customers.Customer` is `organization + name + email + phone` with no
 *     `User` foreign key, and `OrganizationMembership.Role` is only
 *     `ADMIN | STAFF`. There is no customer account, no customer login and no
 *     customer registration endpoint.
 *
 *  4. CUSTOMER BOOKING PERMISSION
 *     `BookingListCreateView.permission_classes = [IsOrganizationStaff]`, so a
 *     customer cannot create a booking through the existing API.
 *
 * Nothing here is a frontend workaround for those gaps: the page states the
 * blocker instead of pretending. See `frontend/README.md` → "Customer booking
 * portal: backend requirements" for the exact endpoints and models needed.
 */
@Component({
  selector: 'app-public-booking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent, IconComponent],
  templateUrl: './public-booking.component.html',
})
export class PublicBookingComponent {
  /** From `/book/:organizationSlug`. Echoed back, never sent anywhere. */
  readonly organizationSlug = input<string>('');
  /** From `/book/:organizationSlug/:step`, e.g. `services` or `date`. */
  readonly step = input<string>('');

  protected readonly steps: PlannedStep[] = [
    { label: 'Choose a service', hint: 'What you need, how long it takes', icon: 'scissors' },
    { label: 'Pick a staff member', hint: 'Only those who perform it', icon: 'user' },
    { label: 'Select a date', hint: 'Days the team actually works', icon: 'calendar' },
    { label: 'Choose a time', hint: 'Slots inside their working hours', icon: 'clock' },
    { label: 'Your details', hint: 'Name and contact information', icon: 'users' },
    { label: 'Confirmation', hint: 'A reference for your appointment', icon: 'check' },
  ];

  /** What the visitor asked for, so the page is specific rather than generic. */
  protected readonly requested = computed(() => this.organizationSlug() || null);

  protected readonly requestedStep = computed(() => this.step() || null);

  /**
   * The backend capabilities this screen is waiting on, in the order they would
   * be needed. Kept in the component rather than hard-coded in the template so
   * the list stays reviewable and testable.
   */
  protected readonly blockers: Array<{ title: string; detail: string }> = [
    {
      title: 'A public organization endpoint',
      detail:
        'Organization has no slug field and no URL routes at all, so a public URL like ' +
        '/book/abc-clinic cannot be resolved. A slug column plus an unauthenticated ' +
        'read-only endpoint are required.',
    },
    {
      title: 'Unauthenticated read access to services and staff',
      detail:
        'The global default permission is IsAuthenticated and every view requires an ' +
        'organization membership, so a visitor cannot list services, staff or opening ' +
        'hours without a token.',
    },
    {
      title: 'A customer identity',
      detail:
        'The Customer model holds no link to a Django User, and the only roles are ' +
        'ADMIN and STAFF — there is no customer account, login or registration.',
    },
    {
      title: 'A booking permission for customers',
      detail:
        'Booking creation requires IsOrganizationStaff, so a customer cannot book ' +
        'through the existing endpoint even if everything above existed.',
    },
  ];
}
